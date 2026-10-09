/**
 * ORDERS SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Order lifecycle ka poora business logic — create,
 * list, status update, payment, void. Sabse important cheez:
 * PRICES SERVER PE CALCULATE HOTE HAIN, client se aaye price
 * kabhi trust nahi karte — warna koi bhi Cashier app ko bypass
 * karke API directly hit kar sakta tha ₹0 ka order bana ke.
 *
 * FIX: pehle payOrder/updateOrderStatus/voidOrder alag-alag shape ka order
 * return karte the (kisi me items nahi, kisi me product.name nahi, table
 * kahin nahi). Ab sab ek hi ORDER_INCLUDE use karte hain — REST response aur
 * Socket.io event dono me hamesha poora order jaata hai, isliye app ki state
 * me kabhi adhoora order nahi ghusega (order.items undefined crash ki wajah yehi thi).
 *
 * CONNECTED TO:
 * - order-number.service.ts → daily order number yahan se aata hai
 * - config/db.ts             → Prisma client
 * - middleware/audit-logger.ts → void/cancel actions log karta hai
 * - orders.controller.ts      → HTTP layer isko call karta hai
 * - packages/shared-schemas   → input types
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import { getNextOrderNumber } from "./order-number.service";
import { logAuditAction } from "../../middleware/audit-logger";
// FIX (2026-09-29): Float paise errors rokne ke liye (dekho utils/money.ts)
import { round2 } from "../../utils/money";
// ADDED (2026-10-09): Stock SOP — order pe recipe se stock kaatna / cancel pe wapas
import { computeConsumption, deductStockForOrder, reverseStockForOrder, type StockChange } from "../inventory/stock.service";
import type {
  CreateOrderInput,
  UpdateOrderStatusInput,
  PayOrderInput,
  VoidOrderInput,
} from "@cafe-pos/shared-schemas";

// Single source of truth for "what a full order looks like" when it leaves the
// backend — used by every function below that returns an order.
const ORDER_INCLUDE = {
  items: { include: { product: { select: { name: true } } } },
  table: true,
} as const;

function notFound(message: string): never {
  const err: any = new Error(message);
  err.statusCode = 404;
  throw err;
}

// FIX (2026-09-29): 400/409 errors ke liye helper (pehle har jagah inline banate the)
function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}


/**
 * USE CASE: Table ka OCCUPIED/AVAILABLE status orders se DERIVE hota hai, haath se
 * toggle nahi. Pehle koi bhi order function table ko touch nahi karta tha, isliye
 * Dashboard ka "Tables Occupied" kabhi hilta hi nahi tha.
 *
 * Rule: table tab tak OCCUPIED hai jab tak uspe koi "active" order hai. Order
 * active nahi hai jab wo CANCELLED ho, ya SERVED + PAID dono ho chuka ho (QR flow me
 * customer khane ke baad counter pe pay karta hai, to SERVED akela kaafi nahi).
 * Idempotent hai — kitni baar bhi call ho, same result. RESERVED table ko tab
 * chhedte nahi jab tak uspe order na aaye.
 */
async function syncTableStatus(
  db: Prisma.TransactionClient,
  tableId: string | null | undefined,
  outletId: string
) {
  if (!tableId) return; // takeaway/delivery orders ka koi table nahi hota

  const activeOrders = await db.order.count({
    where: {
      tableId,
      outletId,
      // NOT: [a, b] = "a nahi hai AUR b nahi hai"
      NOT: [{ orderStatus: "CANCELLED" }, { orderStatus: "SERVED", paymentStatus: "PAID" }],
    },
  });

  const table = await db.table.findFirst({
    where: { id: tableId, outletId },
    select: { status: true },
  });
  if (!table) return;

  if (activeOrders > 0 && table.status !== "OCCUPIED") {
    await db.table.update({ where: { id: tableId }, data: { status: "OCCUPIED" } });
  } else if (activeOrders === 0 && table.status === "OCCUPIED") {
    await db.table.update({ where: { id: tableId }, data: { status: "AVAILABLE" } });
  }
}

/**
 * USE CASE: Naya order banata hai. Har item ka price PRODUCT/VARIANT/ADDON
 * table se dobara nikala jaata hai (client jo bheje usko ignore karte hain)
 * — yeh ek security-critical decision hai, price tampering rokne ke liye.
 *
 * @param cashierId - null rahega jab customer QR web se order aayega
 *                    (public-menu module mein, baad mein banayenge)
 */
export async function createOrder(
  input: CreateOrderInput,
  outletId: string,
  cashierId: string | null
) {
  return prisma.$transaction(async (tx) => {
    const productIds = input.items.map((i) => i.productId);

    // Ek hi query mein saare products + unke variants/addons laate hain —
    // N+1 query problem se bachne ke liye (har item ke liye alag query nahi)
    // FIX (2026-09-29): tableId pehle bina check ke order pe lag jaata tha — koi
    // bhi doosre outlet ki table ka UUID bhej ke order us table se link kar sakta
    // tha, aur response (ORDER_INCLUDE → table) mein us cafe ki table ka data
    // leak hota. Ab table isi outlet ki honi chahiye.
    if (input.tableId) {
      const table = await tx.table.findFirst({
        where: { id: input.tableId, outletId },
        select: { id: true },
      });
      if (!table) notFound("Table not found in this outlet");
    }

    const products = await tx.product.findMany({
      where: { id: { in: productIds }, outletId, archivedAt: null }, // FIX (2026-09-29): deleted product order nahi ho sakta
      // FIX (2026-09-29): category.isAvailable bhi laate hain — pehle hidden
      // category ke products bhi order ho jaate the (public menu unhe chhupata tha,
      // lekin API seedha hit karke order ban jaata tha)
      include: { variants: true, addons: true, category: { select: { isAvailable: true } } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalAmount = 0;
    let taxAmount = 0;
    const itemsData: {
      productId: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      notes: string | null;
      variantName: string | null; // ADDED (2026-10-09): size-wise recipe + bill pe size
    }[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) notFound(`Product ${item.productId} not found in this outlet`);
      if (!product.isAvailable || !product.category.isAvailable) {
        httpError(`${product.name} is currently unavailable`, 400, "PRODUCT_UNAVAILABLE");
      }

      // Base price: variant price if selected, warna product ka base price
      let unitPrice = product.price;
      let variantName: string | null = null;
      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant) notFound(`Variant ${item.variantId} not found for this product`);
        unitPrice = variant.price;
        variantName = variant.name;
      }

      // Addons ki price unit price mein add hoti hai (per-item, not per-quantity-unit twice)
      if (item.addonIds?.length) {
        const selectedAddons = product.addons.filter((a) => item.addonIds!.includes(a.id));
        unitPrice += selectedAddons.reduce((sum, a) => sum + a.price, 0);
      }

      // FIX (2026-09-29): round2 — floating-point paisa errors rokne ke liye
      unitPrice = round2(unitPrice);
      const itemTotal = round2(unitPrice * item.quantity);
      const itemTax = round2(itemTotal * (product.taxRate / 100));

      totalAmount = round2(totalAmount + itemTotal);
      taxAmount = round2(taxAmount + itemTax);

      itemsData.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal,
        notes: item.notes ?? null,
        variantName,
      });
    }

    const netAmount = round2(totalAmount + taxAmount);

    // ADDED (2026-10-09): STOCK SOP — recipe se kitna lagega, order-number lock se PEHLE nikaal lo.
    // Aaj ka order counter har order ke liye ek hi row hai (rush mein sab yahin line lagate hain);
    // lock ke andar jitna kam kaam, utne zyada orders per second.
    const stockNeed = await computeConsumption(
      tx,
      outletId,
      itemsData.map((i) => ({ productId: i.productId, variantName: i.variantName, quantity: i.quantity }))
    );

    // CRITICAL: order number aur order creation SAME transaction (tx) mein hain —
    // agar order creation fail ho, counter increment bhi rollback ho jayega
    const orderNumber = await getNextOrderNumber(tx, outletId);

    const order = await tx.order.create({
      data: {
        orderNumber,
        outletId,
        tableId: input.tableId,
        orderType: input.orderType,
        totalAmount,
        taxAmount,
        discountAmount: 0,
        netAmount,
        cashierId,
        notes: input.notes,
        // ADDED (2026-10-06): QR/cashier order ka customer (shared-schema pe normalise ho chuka)
        customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null,
        items: { create: itemsData },
      },
      // table bhi include: warna socket event ke saath aaya naya Dine-In order
      // live strip me "Table 3" ki jagah "DINE IN" dikhata jab tak refetch na ho
      include: ORDER_INCLUDE,
    });

    // Same transaction: order bana aur table OCCUPIED hua — dono ya koi nahi
    await syncTableStatus(tx, order.tableId, outletId);

    // ADDED (2026-10-09): STOCK SOP — order place hote hi recipe se stock kaato, ISI transaction
    // mein (order fail → stock bhi nahi kata). Stock 0/minus ho tab bhi bill nahi rukta (Vicky ka
    // faisla) — sirf `stockChange.alerts` mein batate hain jo item abhi LOW/OUT hua.
    // Controller `stockChange` ko alag kar leta hai (socket/response ka order shape same rehta hai).
    const stockChange: StockChange = await deductStockForOrder(tx, {
      outletId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: cashierId,
      lines: [],
      need: stockNeed,
    });

    return { ...order, stockChange };
  });
}

/**
 * USE CASE: Orders list karta hai filters ke saath — Cashier ka "active
 * orders" view, ya Owner ka date-range wala history dono isi se aayenge.
 */
// FIX (2026-09-29): list ka hard cap. Pehle `/orders` outlet ke ALL-TIME orders
// (items ke saath) har baar laata tha — mobile app har screen-focus pe isko call
// karta hai, to 3 mahine baad ek cafe ke hazaaron orders har tap pe aate, aur
// 1000 cafes pe DB pe bahut bhaari padta. Ab default 200 latest orders, max 500.
// Response shape (array) same hai isliye mobile code change nahi karna pada.
export const DEFAULT_ORDERS_LIMIT = 200;
export const MAX_ORDERS_LIMIT = 500;

export async function getOrders(
  outletId: string,
  filters: {
    orderStatus?: Prisma.OrderWhereInput["orderStatus"];
    tableId?: string;
    paymentStatus?: Prisma.OrderWhereInput["paymentStatus"];
    dateFrom?: Date;
    dateTo?: Date;
    limit?: number;
  }
) {
  return prisma.order.findMany({
    where: {
      outletId,
      orderStatus: filters.orderStatus,
      tableId: filters.tableId,
      paymentStatus: filters.paymentStatus,
      createdAt:
        filters.dateFrom || filters.dateTo
          ? { gte: filters.dateFrom, lte: filters.dateTo }
          : undefined,
    },
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: Math.min(filters.limit ?? DEFAULT_ORDERS_LIMIT, MAX_ORDERS_LIMIT),
  });
}

/** USE CASE: Ek order ki poori detail (KDS screen ya bill-detail view ke liye) */
export async function getOrderById(orderId: string, outletId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, outletId },
    include: ORDER_INCLUDE,
  });
  if (!order) notFound("Order not found in this outlet");
  return order;
}

/** USE CASE: Poore order ka status update karta hai (jaise SERVED mark karna) */
export async function updateOrderStatus(
  orderId: string,
  outletId: string,
  input: UpdateOrderStatusInput
) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
  if (!order) notFound("Order not found in this outlet");

  // FIX (2026-09-29): cancelled order ko wapas PENDING/SERVED karna band —
  // warna void hua order (jiska audit log bana) chupke se "zinda" ho sakta tha.
  // CANCELLED status khud ab schema se hi reject hota hai (sirf /void route se).
  if (order.orderStatus === "CANCELLED") {
    httpError("This order has been cancelled and can no longer be updated", 409, "ORDER_CANCELLED");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { orderStatus: input.status },
    include: ORDER_INCLUDE,
  });

  await syncTableStatus(prisma, updated.tableId, outletId);
  return updated;
}

/**
 * USE CASE: Ek single order-item ka status update — yeh KDS ka core action
 * hai (Chef ek item ko PENDING → PREPARING → READY karta hai, poora order
 * nahi, kyunki ek order mein multiple items alag-alag speed se ban te hain)
 */
export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  outletId: string,
  status: "PENDING" | "PREPARING" | "READY"
) {
  // Pehle verify karo order isi outlet ka hai (security check)
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
  if (!order) notFound("Order not found in this outlet");
  if (order.orderStatus === "CANCELLED") {
    httpError("This order has been cancelled", 409, "ORDER_CANCELLED");
  }

  // FIX (2026-09-29): CROSS-OUTLET BUG. Pehle order check hone ke baad item
  // sirf `itemId` se update hota tha — Chef apne outlet ka koi bhi orderId aur
  // KISI DOOSRE cafe ke order-item ka id bhej ke us cafe ka KDS item badal sakta
  // tha. Ab update tabhi hota hai jab item ISI order ka ho (orderId match).
  const { count } = await prisma.orderItem.updateMany({
    where: { id: itemId, orderId },
    data: { status },
  });
  if (count === 0) notFound("Item not found in this order");

  return prisma.orderItem.findUniqueOrThrow({ where: { id: itemId } });
}

/**
 * USE CASE: Payment complete karta hai — discount apply karta hai, final
 * amount lock karta hai, paymentStatus PAID karta hai. Poora order (items +
 * table ke saath) return karta hai, taaki caller ki state me kabhi partial
 * order na jaye.
 *
 * FIX (2026-09-29) — zero-theft holes band kiye:
 * 1. Discount bill se zyada nahi ho sakta (pehle negative bill ban sakta tha).
 * 2. PAID order dobara pay nahi ho sakta — pehle Cashier payment ke BAAD
 *    dobara "pay" karke discount badha sakta tha (cash le liya, record mein kam dikhaya).
 * 3. CANCELLED order pe payment nahi.
 * 4. Har discount ab AuditLog mein "APPLY_DISCOUNT" likhta hai (Owner ke audit
 *    screen pe dikhta hai) — pehle yeh action kahin log hi nahi hota tha.
 * 5. Sab kuch ek transaction mein + conditional update, taaki do devices ek
 *    saath same order pay karein to sirf ek hi jeete (double-payment race).
 */
export async function payOrder(
  orderId: string,
  outletId: string,
  userId: string,
  input: PayOrderInput
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, outletId } });
    if (!order) notFound("Order not found in this outlet");
    if (order.orderStatus === "CANCELLED") {
      httpError("Cannot take payment for a cancelled order", 409, "ORDER_CANCELLED");
    }
    if (order.paymentStatus === "PAID") {
      httpError("This order is already paid", 409, "ALREADY_PAID");
    }

    const grossAmount = round2(order.totalAmount + order.taxAmount);
    const discountAmount = round2(input.discountAmount ?? 0);
    if (discountAmount > grossAmount) {
      httpError("Discount cannot be more than the bill amount", 400, "DISCOUNT_TOO_HIGH");
    }
    const finalNetAmount = round2(grossAmount - discountAmount);

    // Conditional update: agar beech mein kisi aur device ne pay/void kar diya,
    // to count 0 aayega aur hum double-payment nahi likhenge
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        outletId,
        paymentStatus: { not: "PAID" },
        orderStatus: { not: "CANCELLED" },
      },
      data: {
        paymentMethod: input.paymentMethod,
        paymentStatus: "PAID",
        discountAmount,
        netAmount: finalNetAmount,
      },
    });
    if (count === 0) {
      httpError("This order was just updated on another device. Please refresh.", 409, "ORDER_CONFLICT");
    }

    if (discountAmount > 0) {
      await tx.auditLog.create({
        data: {
          userId,
          outletId,
          action: "APPLY_DISCOUNT",
          metadata: {
            orderId,
            orderNumber: order.orderNumber,
            grossAmount,
            discountAmount,
            netAmount: finalNetAmount,
            paymentMethod: input.paymentMethod,
          },
        },
      });
    }

    await syncTableStatus(tx, order.tableId, outletId);
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
}

/**
 * USE CASE: Order void/cancel karta hai. ZERO-THEFT AUDIT feature ka core —
 * har void AuditLog mein likha jaata hai, kaun (userId), kab, kyun (reason).
 * Route level pe already authorize("OWNER","MANAGER") lagega, but yeh function
 * bhi apna kaam theek se karta hai chahe kahin se bhi call ho.
 */
export async function voidOrder(
  orderId: string,
  outletId: string,
  userId: string,
  input: VoidOrderInput
) {
  // FIX (2026-09-29): void + audit log ab EK transaction mein hain. Pehle order
  // CANCELLED ho jaata tha aur agar audit write fail hota to void bina kisi
  // record ke reh jaata — zero-theft feature ke liye yeh sabse bura case hai.
  // Saath hi:
  //  - already-cancelled order dobara void nahi hota (duplicate audit entries band)
  //  - PAID order void hone pe paymentStatus REFUNDED ho jaata hai, taaki
  //    records mein "paisa liya, order cancel" wala mismatch na rahe; audit
  //    metadata mein wasPaid + amount bhi jaata hai taaki Owner ko dikhe.
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, outletId } });
    if (!order) notFound("Order not found in this outlet");
    if (order.orderStatus === "CANCELLED") {
      httpError("This order is already cancelled", 409, "ORDER_CANCELLED");
    }

    const wasPaid = order.paymentStatus === "PAID";
    const { count } = await tx.order.updateMany({
      where: { id: orderId, outletId, orderStatus: { not: "CANCELLED" } },
      data: {
        orderStatus: "CANCELLED",
        ...(wasPaid ? { paymentStatus: "REFUNDED" as const } : {}),
      },
    });
    if (count === 0) {
      httpError("This order was just updated on another device. Please refresh.", 409, "ORDER_CONFLICT");
    }

    await syncTableStatus(tx, order.tableId, outletId);

    // ADDED (2026-10-09): STOCK SOP — cancel pe stock wapas. Khana ban chuka tha (foodMade) to
    // wapas nahi, WASTAGE mein (variance/wastage report sahi rahe). Purana app foodMade nahi
    // bhejta → stock wapas (pehle jaisa behaviour).
    const foodMade = input.foodMade === true;
    await reverseStockForOrder(tx, {
      outletId,
      orderId,
      orderNumber: order.orderNumber,
      userId,
      foodMade,
      reason: input.reason,
    });

    // Audit trail — yeh line hi PRD ka "Zero-Theft Audit Logs" feature deliver karti hai
    await logAuditAction(
      {
        userId,
        outletId,
        action: "CANCEL_ORDER",
        metadata: {
          orderId,
          orderNumber: order.orderNumber,
          reason: input.reason,
          wasPaid,
          netAmount: order.netAmount,
          foodMade, // ADDED (2026-10-09): stock wapas aaya ya wastage
        },
      },
      tx
    );

    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
}