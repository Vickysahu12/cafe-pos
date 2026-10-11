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
import { computeConsumption, deductStockForOrder, reverseStockForOrder, estimateRecipeCosts, type StockChange } from "../inventory/stock.service";
import type {
  CreateOrderInput,
  UpdateOrderStatusInput,
  PayOrderInput,
  VoidOrderInput,
  ComplimentaryOrderInput,
  UpdateDeliveryInput,
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
  cashierId: string | null,
  // ADDED (2026-10-11): COMPLIMENTARY — sirf OWNER/MANAGER free item de sakte hain. QR (public) se
  // role null aata hai → complimentary hamesha mana.
  opts: {
    role?: string | null;
    // ADDED (2026-10-11): DELIVERY — server tay karta hai (outlet setting), client kabhi nahi
    delivery?: { charge: number; minOrder: number };
  } = {}
) {
  // ADDED (2026-10-11): COMPLIMENTARY — role + reason check transaction se pehle (sasta, saaf error)
  const hasComp = input.items.some((i) => i.complimentary === true);
  if (hasComp) {
    if (opts.role !== "OWNER" && opts.role !== "MANAGER") {
      httpError("Only the Owner or a Manager can make items complimentary", 403, "COMP_NOT_ALLOWED");
    }
    if (!input.complimentaryReason) {
      httpError("Please add a reason for the complimentary items", 400, "COMP_REASON_REQUIRED");
    }
  }

  return prisma.$transaction(async (tx) => {
    const productIds = input.items.map((i) => i.productId);

    // Ek hi query mein saare products + unke variants/addons laate hain —
    // N+1 query problem se bachne ke liye (har item ke liye alag query nahi)
    // FIX (2026-09-29): tableId pehle bina check ke order pe lag jaata tha — koi
    // bhi doosre outlet ki table ka UUID bhej ke order us table se link kar sakta
    // tha, aur response (ORDER_INCLUDE → table) mein us cafe ki table ka data
    // leak hota. Ab table isi outlet ki honi chahiye.
    // UPDATED (2026-10-11): TABLE EDIT — deleted (archived) table pe order nahi. FOR SHARE lock:
    // usi pal koi table delete kare to dono mein se ek hi jeete (delete FOR UPDATE leta hai) —
    // ya to bill ban jaata hai aur delete "running order" bol ke rukta hai, ya delete pehle hua
    // to bill "Table not found" — kabhi deleted table pe chalta order nahi.
    if (input.tableId) {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM tables
        WHERE id = ${input.tableId} AND "outletId" = ${outletId} AND "archivedAt" IS NULL
        FOR SHARE
      `;
      if (rows.length === 0) notFound("Table not found in this outlet");
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
      // ADDED (2026-10-11): COMPLIMENTARY
      isComplimentary: boolean;
      compValue: number;
      compCost: number;
      compReason: string | null;
      compById: string | null;
    }[] = [];
    let complimentaryValue = 0;

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

      // ADDED (2026-10-11): COMPLIMENTARY — free item ka total/tax bill mein nahi judta (revenue 0),
      // unitPrice menu price hi rehta hai, aur "kitne ka free diya" compValue mein.
      const comp = item.complimentary === true;
      if (comp) {
        complimentaryValue = round2(complimentaryValue + itemTotal);
      } else {
        totalAmount = round2(totalAmount + itemTotal);
        taxAmount = round2(taxAmount + itemTax);
      }

      itemsData.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: comp ? 0 : itemTotal,
        notes: item.notes ?? null,
        variantName,
        isComplimentary: comp,
        compValue: comp ? itemTotal : 0,
        compCost: 0, // neeche recipe se bharte hain
        compReason: comp ? input.complimentaryReason ?? null : null,
        compById: comp ? cashierId : null,
      });
    }

    // ADDED (2026-10-11): free items ka ingredients cost (recipe × cost) — report ke liye
    const compIdx = itemsData.map((d, i) => (d.isComplimentary ? i : -1)).filter((i) => i >= 0);
    if (compIdx.length > 0) {
      const costs = await estimateRecipeCosts(
        tx,
        outletId,
        compIdx.map((i) => ({ productId: itemsData[i].productId, variantName: itemsData[i].variantName, quantity: itemsData[i].quantity }))
      );
      compIdx.forEach((i, k) => (itemsData[i].compCost = costs[k]));
    }

    // ADDED (2026-10-11): DELIVERY — min order (items ka total, tax/free items ke bina) + charge.
    // Charge par tax nahi lagta (cafe apni setting mein inclusive rakhta hai).
    const isDelivery = input.orderType === "DELIVERY";
    const deliveryCharge = isDelivery ? round2(opts.delivery?.charge ?? 0) : 0;
    if (isDelivery && opts.delivery && opts.delivery.minOrder > 0 && totalAmount < opts.delivery.minOrder) {
      httpError(
        `Minimum order for delivery is ₹${opts.delivery.minOrder}. Add ₹${round2(opts.delivery.minOrder - totalAmount)} more.`,
        400,
        "DELIVERY_MIN_ORDER"
      );
    }
    const netAmount = round2(totalAmount + taxAmount + deliveryCharge);

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
        complimentaryValue, // ADDED (2026-10-11)
        // ADDED (2026-10-11): DELIVERY
        ...(isDelivery
          ? { deliveryAddress: input.deliveryAddress ?? null, deliveryCharge, deliveryStatus: "PLACED" as const }
          : {}),
        // ADDED (2026-10-11): poora bill free (₹0) → seedha PAID, cashier ko "₹0 collect" nahi karna padta
        ...(netAmount === 0 && complimentaryValue > 0 ? { paymentStatus: "PAID" as const } : {}),
        items: { create: itemsData },
      },
      // table bhi include: warna socket event ke saath aaya naya Dine-In order
      // live strip me "Table 3" ki jagah "DINE IN" dikhata jab tak refetch na ho
      include: ORDER_INCLUDE,
    });

    // Same transaction: order bana aur table OCCUPIED hua — dono ya koi nahi
    await syncTableStatus(tx, order.tableId, outletId);

    // ADDED (2026-10-11): COMPLIMENTARY audit — kisne, kya, kitne ka, kyun (owner ko misuse dikhe)
    if (compIdx.length > 0 && cashierId) {
      await logAuditAction(
        {
          userId: cashierId,
          outletId,
          action: "COMPLIMENTARY",
          metadata: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            reason: input.complimentaryReason,
            value: complimentaryValue,
            cost: round2(compIdx.reduce((s, i) => s + itemsData[i].compCost, 0)),
            items: order.items
              .filter((i) => i.isComplimentary)
              .map((i) => ({ name: i.product.name, size: i.variantName, quantity: i.quantity, value: i.compValue })),
          },
        },
        tx
      );
    }

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

    // FIX (2026-10-11): DELIVERY charge bhi bill ka hissa — pehle sirf items + tax se net banta tha,
    // to payment ke time delivery charge chupchaap gayab ho jaata.
    const grossAmount = round2(order.totalAmount + order.taxAmount + order.deliveryCharge);
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
/**
 * ADDED (2026-10-11): COMPLIMENTARY on an existing order (Owner/Manager — route pe authorize).
 * Use case: customer ko khana pasand nahi aaya / regular guest / staff meal — order ban chuka hai,
 * ab ek item (ya poora bill) free karna hai.
 * Rules:
 *  - Sirf UNPAID / PARTIAL order. PAID pe mana (paisa le liya — cancel karke dobara bill karo).
 *    Cancelled pe mana.
 *  - Item free → totalPrice 0, compValue = jo price tha, compCost = recipe se. Bill ka total + tax
 *    dobara nikalta hai (sirf bache hue paid items pe). Stock pe koi asar nahi (pehle hi kat chuka).
 *  - Sab items free → net ₹0 → order PAID (cashier ko ₹0 collect nahi karna).
 *  - Conditional update (paymentStatus != PAID) — do phone ek saath pay + comp karein to ek hi jeete.
 *  - COMPLIMENTARY audit log.
 */
export async function complimentaryOrder(
  orderId: string,
  outletId: string,
  userId: string,
  input: ComplimentaryOrderInput
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, outletId },
      include: { items: { include: { product: { select: { name: true, taxRate: true } } } } },
    });
    if (!order) notFound("Order not found in this outlet");
    if (order.orderStatus === "CANCELLED") httpError("This order has been cancelled", 409, "ORDER_CANCELLED");
    if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
      httpError("This bill is already paid. Cancel it and bill again to make items free.", 409, "ALREADY_PAID");
    }

    const wanted = input.itemIds === "all" ? null : new Set(input.itemIds);
    if (wanted) {
      const unknown = [...wanted].filter((id) => !order.items.some((i) => i.id === id));
      if (unknown.length > 0) notFound("An item was not found in this order. Refresh and try again.");
    }
    const targets = order.items.filter((i) => !i.isComplimentary && (wanted ? wanted.has(i.id) : true));
    if (targets.length === 0) httpError("These items are already complimentary", 409, "NOTHING_TO_COMP");

    const costs = await estimateRecipeCosts(
      tx,
      outletId,
      targets.map((t) => ({ productId: t.productId, variantName: t.variantName, quantity: t.quantity }))
    );

    // Naye totals: free items hata ke, baaki items ka total + tax (product ka taxRate)
    const targetIds = new Set(targets.map((t) => t.id));
    let totalAmount = 0;
    let taxAmount = 0;
    for (const i of order.items) {
      if (i.isComplimentary || targetIds.has(i.id)) continue;
      totalAmount = round2(totalAmount + i.totalPrice);
      taxAmount = round2(taxAmount + round2(i.totalPrice * (i.product.taxRate / 100)));
    }
    const netAmount = round2(totalAmount + taxAmount + order.deliveryCharge); // delivery charge free nahi hota
    const addedValue = round2(targets.reduce((s, t) => s + t.totalPrice, 0));

    const { count } = await tx.order.updateMany({
      where: { id: orderId, outletId, paymentStatus: { notIn: ["PAID", "REFUNDED"] }, orderStatus: { not: "CANCELLED" } },
      data: {
        totalAmount,
        taxAmount,
        netAmount,
        complimentaryValue: round2(order.complimentaryValue + addedValue),
        ...(netAmount === 0 ? { paymentStatus: "PAID" as const } : {}),
      },
    });
    if (count === 0) httpError("This order was just updated on another device. Please refresh.", 409, "ORDER_CONFLICT");

    for (let k = 0; k < targets.length; k++) {
      const t = targets[k];
      await tx.orderItem.update({
        where: { id: t.id },
        data: {
          isComplimentary: true,
          compValue: t.totalPrice,
          compCost: costs[k],
          compReason: input.reason,
          compById: userId,
          totalPrice: 0,
        },
      });
    }

    await logAuditAction(
      {
        userId,
        outletId,
        action: "COMPLIMENTARY",
        metadata: {
          orderId,
          orderNumber: order.orderNumber,
          reason: input.reason,
          value: addedValue,
          cost: round2(costs.reduce((s, c) => s + c, 0)),
          items: targets.map((t) => ({ name: t.product.name, size: t.variantName, quantity: t.quantity, value: t.totalPrice })),
        },
      },
      tx
    );

    await syncTableStatus(tx, order.tableId, outletId);
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
}


/**
 * ADDED (2026-10-11): DELIVERY — staff order pe:
 *  - deliveryCharge badle (Owner/Manager; sirf unpaid) → net dobara (items + tax + charge − kuch nahi)
 *  - deliveryStatus aage badhaye: PLACED → OUT_FOR_DELIVERY → DELIVERED (peeche nahi jaata).
 *    DELIVERED = orderStatus SERVED bhi (kitchen/orders list se hat jaaye).
 * Cancelled order pe kuch nahi. Charge badla to audit log (DELIVERY_CHARGE_CHANGE).
 */
const DELIVERY_STEP: Record<string, number> = { PLACED: 0, OUT_FOR_DELIVERY: 1, DELIVERED: 2 };

export async function updateDelivery(
  orderId: string,
  outletId: string,
  userId: string,
  role: string,
  input: UpdateDeliveryInput
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findFirst({ where: { id: orderId, outletId } });
    if (!order) notFound("Order not found in this outlet");
    if (order.orderType !== "DELIVERY") httpError("This is not a delivery order", 400, "NOT_DELIVERY");
    if (order.orderStatus === "CANCELLED") httpError("This order has been cancelled", 409, "ORDER_CANCELLED");

    const data: Prisma.OrderUpdateManyMutationInput = {};

    if (input.deliveryCharge !== undefined) {
      if (role !== "OWNER" && role !== "MANAGER") {
        httpError("Only the Owner or a Manager can change the delivery charge", 403, "FORBIDDEN");
      }
      if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
        httpError("This bill is already paid. The delivery charge can't be changed now.", 409, "ALREADY_PAID");
      }
      const charge = round2(input.deliveryCharge);
      data.deliveryCharge = charge;
      data.netAmount = round2(order.totalAmount + order.taxAmount + charge);
    }

    if (input.deliveryStatus !== undefined) {
      const from = DELIVERY_STEP[order.deliveryStatus ?? "PLACED"];
      const to = DELIVERY_STEP[input.deliveryStatus];
      if (to < from) httpError("A delivery can't go back a step", 409, "DELIVERY_BACKWARDS");
      data.deliveryStatus = input.deliveryStatus;
      if (input.deliveryStatus === "DELIVERED") data.orderStatus = "SERVED";
    }

    // Conditional: beech mein cancel/pay ho gaya ho to overwrite nahi
    const { count } = await tx.order.updateMany({
      where: {
        id: orderId,
        outletId,
        orderStatus: { not: "CANCELLED" },
        ...(input.deliveryCharge !== undefined ? { paymentStatus: { notIn: ["PAID", "REFUNDED"] } } : {}),
      },
      data,
    });
    if (count === 0) httpError("This order was just updated on another device. Please refresh.", 409, "ORDER_CONFLICT");

    if (input.deliveryCharge !== undefined && input.deliveryCharge !== order.deliveryCharge) {
      await logAuditAction(
        {
          userId,
          outletId,
          action: "DELIVERY_CHARGE_CHANGE",
          metadata: { orderId, orderNumber: order.orderNumber, from: order.deliveryCharge, to: round2(input.deliveryCharge) },
        },
        tx
      );
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
  });
}
