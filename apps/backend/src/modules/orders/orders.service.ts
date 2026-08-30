/**
 * ORDERS SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Order lifecycle ka poora business logic — create,
 * list, status update, payment, void. Sabse important cheez:
 * PRICES SERVER PE CALCULATE HOTE HAIN, client se aaye price
 * kabhi trust nahi karte — warna koi bhi Cashier app ko bypass
 * karke API directly hit kar sakta tha ₹0 ka order bana ke.
 *
 * CONNECTED TO:
 * - order-number.service.ts → daily order number yahan se aata hai
 * - config/db.ts             → Prisma client
 * - middleware/audit-logger.ts → void/cancel actions log karta hai
 * - orders.controller.ts      → HTTP layer isko call karta hai
 * - packages/shared-schemas   → input types
 */

import { prisma } from "../../config/db";
import { getNextOrderNumber } from "./order-number.service";
import { logAuditAction } from "../../middleware/audit-logger";
import type {
  CreateOrderInput,
  UpdateOrderStatusInput,
  PayOrderInput,
  VoidOrderInput,
} from "@cafe-pos/shared-schemas";

function notFound(message: string): never {
  const err: any = new Error(message);
  err.statusCode = 404;
  throw err;
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
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, outletId },
      include: { variants: true, addons: true },
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
    }[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product) notFound(`Product ${item.productId} not found in this outlet`);
      if (!product.isAvailable) {
        const err: any = new Error(`${product.name} is currently unavailable`);
        err.statusCode = 400;
        throw err;
      }

      // Base price: variant price if selected, warna product ka base price
      let unitPrice = product.price;
      if (item.variantId) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant) notFound(`Variant ${item.variantId} not found for this product`);
        unitPrice = variant.price;
      }

      // Addons ki price unit price mein add hoti hai (per-item, not per-quantity-unit twice)
      if (item.addonIds?.length) {
        const selectedAddons = product.addons.filter((a) => item.addonIds!.includes(a.id));
        unitPrice += selectedAddons.reduce((sum, a) => sum + a.price, 0);
      }

      const itemTotal = unitPrice * item.quantity;
      const itemTax = itemTotal * (product.taxRate / 100);

      totalAmount += itemTotal;
      taxAmount += itemTax;

      itemsData.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal,
        notes: item.notes ?? null,
      });
    }

    const netAmount = totalAmount + taxAmount;

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
        items: { create: itemsData },
      },
      include: { items: { include: { product: { select: { name: true } } } } },
    });

    return order;
  });
}

/**
 * USE CASE: Orders list karta hai filters ke saath — Cashier ka "active
 * orders" view, ya Owner ka date-range wala history dono isi se aayenge.
 */
export async function getOrders(
  outletId: string,
  filters: {
    orderStatus?: string;
    tableId?: string;
    paymentStatus?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }
) {
  return prisma.order.findMany({
    where: {
      outletId,
      orderStatus: filters.orderStatus as any,
      tableId: filters.tableId,
      paymentStatus: filters.paymentStatus as any,
      createdAt:
        filters.dateFrom || filters.dateTo
          ? { gte: filters.dateFrom, lte: filters.dateTo }
          : undefined,
    },
    include: { items: { include: { product: { select: { name: true } } } }, table: true },
    orderBy: { createdAt: "desc" },
  });
}

/** USE CASE: Ek order ki poori detail (KDS screen ya bill-detail view ke liye) */
export async function getOrderById(orderId: string, outletId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, outletId },
    include: { items: { include: { product: { select: { name: true } } } }, table: true },
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

  return prisma.order.update({
    where: { id: orderId },
    data: { orderStatus: input.status },
    include: { items: true },
  });
}

/**
 * USE CASE: Ek single order-item ka status update — yeh KDS ka core action
 * hai (Chef ek item ko PENDING → PREPARING → READY karta hai, poora order
 * nahi, kyunki ek order mein multiple items alag-alag speed se banते हैं)
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

  const item = await prisma.orderItem.update({
    where: { id: itemId },
    data: { status },
  });

  return item;
}

/**
 * USE CASE: Payment complete karta hai — discount apply karta hai, final
 * amount lock karta hai, paymentStatus PAID karta hai.
 */
export async function payOrder(orderId: string, outletId: string, input: PayOrderInput) {
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
  if (!order) notFound("Order not found in this outlet");

  const discountAmount = input.discountAmount ?? 0;
  const finalNetAmount = order.totalAmount + order.taxAmount - discountAmount;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentMethod: input.paymentMethod,
      paymentStatus: "PAID",
      discountAmount,
      netAmount: finalNetAmount,
    },
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
  const order = await prisma.order.findFirst({ where: { id: orderId, outletId } });
  if (!order) notFound("Order not found in this outlet");

  const voided = await prisma.order.update({
    where: { id: orderId },
    data: { orderStatus: "CANCELLED" },
  });

  // Audit trail — yeh line hi PRD ka "Zero-Theft Audit Logs" feature deliver karti hai
  await logAuditAction({
    userId,
    outletId,
    action: "CANCEL_ORDER",
    metadata: { orderId, orderNumber: order.orderNumber, reason: input.reason },
  });

  return voided;
}