/**
 * ANALYTICS SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Owner dashboard ke liye read-only aggregations —
 * daily sales summary aur hourly distribution. Koi write logic
 * nahi hai is module mein (safest module — data corrupt hone ka
 * koi risk nahi, sirf existing Order data ko summarize karta hai).
 *
 * CONNECTED TO:
 * - config/db.ts             → Prisma client
 * - analytics.controller.ts    → HTTP layer isko call karta hai
 * - prisma/schema.prisma        → Order, OrderItem models (read-only)
 */

import { prisma } from "../../config/db";

/** Helper: ek din ki start aur end (00:00:00 se 23:59:59) nikalta hai */
/** Helper: ek din ki start aur end (UTC midnight se UTC 23:59:59) nikalta hai —
 * server ke local timezone pe depend NAHI karta, isliye deployment ke waqt
 * server kahin bhi ho (India, US, kahin bhi), yeh hamesha sahi UTC-day
 * boundary use karega, jo DB mein stored UTC timestamps se match karta hai */
function getDayRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { start, end };
}

/**
 * USE CASE: PRD ka "Daily Summary" widget — total sales, total orders,
 * cash vs UPI split, top-5 selling items. Sab ek hi function mein
 * kyunki Owner dashboard ek hi API call se poora summary load karega
 * (5 alag calls se page load slow hota, isliye ek combined response).
 */
export async function getDailySummary(outletId: string, date: Date = new Date()) {
  const { start, end } = getDayRange(date);

  const orders = await prisma.order.findMany({
    where: { outletId, createdAt: { gte: start, lte: end }, orderStatus: { not: "CANCELLED" } },
    include: { items: { include: { product: { select: { name: true } } } } },
  });

  const paidOrders = orders.filter((o) => o.paymentStatus === "PAID");

  const totalSales = paidOrders.reduce((sum, o) => sum + o.netAmount, 0);
  const totalOrders = orders.length;

  const cashTotal = paidOrders
    .filter((o) => o.paymentMethod === "CASH")
    .reduce((sum, o) => sum + o.netAmount, 0);
  const upiTotal = paidOrders
    .filter((o) => o.paymentMethod === "UPI")
    .reduce((sum, o) => sum + o.netAmount, 0);

  // Top-selling items: sab items ke quantities product-wise jodo, phir sort karo
  const itemCounts = new Map<string, { name: string; quantity: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const existing = itemCounts.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        itemCounts.set(item.productId, { name: item.product.name, quantity: item.quantity });
      }
    }
  }
  const topSellingItems = Array.from(itemCounts.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  return {
    date: start.toISOString().split("T")[0],
    totalSales,
    totalOrders,
    paidOrders: paidOrders.length,
    cashVsUpi: { cash: cashTotal, upi: upiTotal },
    topSellingItems,
  };
}

/**
 * USE CASE: PRD ka "Hourly Sales" — rush-hour distribution, staff
 * scheduling ke liye. Har hour (0-23) mein kitne orders aaye, count karta hai.
 */
export async function getHourlySales(outletId: string, date: Date = new Date()) {
  const { start, end } = getDayRange(date);

  const orders = await prisma.order.findMany({
    where: { outletId, createdAt: { gte: start, lte: end }, orderStatus: { not: "CANCELLED" } },
    select: { createdAt: true, netAmount: true },
  });

  // 24 hours ka array, har hour ke liye orderCount aur revenue
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: 0, revenue: 0 }));

  for (const order of orders) {
    const hour = new Date(order.createdAt).getHours();
    hourly[hour].orderCount += 1;
    hourly[hour].revenue += order.netAmount;
  }

  return hourly;
}