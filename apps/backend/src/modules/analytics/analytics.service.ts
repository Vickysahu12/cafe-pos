/**
 * ANALYTICS SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Owner dashboard ke liye read-only aggregations —
 * daily sales summary aur hourly distribution. "Din" hamesha IST
 * calendar day hai (utils/date.ts se), server timezone se independent.
 *
 * CONNECTED TO:
 * - config/db.ts       → Prisma client
 * - utils/date.ts       → IST day-boundary aur hour helpers
 * - analytics.controller.ts → HTTP layer isko call karta hai
 */

import { prisma } from "../../config/db";
import { getISTDayRangeUTC, getISTHour, formatISTDate } from "../../utils/date";
import { round2 } from "../../utils/money"; // FIX (2026-09-29): Float totals round karne ke liye

export async function getDailySummary(outletId: string, date: Date = new Date()) {
  const { start, end } = getISTDayRangeUTC(date);

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
  // FIX (2026-09-29): CARD/CREDIT/SPLIT payments pehle kisi bucket mein nahi
  // dikhte the — cash + upi ka jod totalSales se kam aata tha aur Owner ko
  // "paisa gayab" lagta. Ab card + other bhi (additive fields, mobile break nahi hota).
  const cardTotal = paidOrders
    .filter((o) => o.paymentMethod === "CARD")
    .reduce((sum, o) => sum + o.netAmount, 0);
  const otherTotal = round2(totalSales - cashTotal - upiTotal - cardTotal);

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
    date: formatISTDate(date),
    totalSales: round2(totalSales),
    totalOrders,
    paidOrders: paidOrders.length,
    cashVsUpi: { cash: round2(cashTotal), upi: round2(upiTotal), card: round2(cardTotal), other: otherTotal },
    topSellingItems,
  };
}

export async function getHourlySales(outletId: string, date: Date = new Date()) {
  const { start, end } = getISTDayRangeUTC(date);

  const orders = await prisma.order.findMany({
    where: { outletId, createdAt: { gte: start, lte: end }, orderStatus: { not: "CANCELLED" } },
    select: { createdAt: true, netAmount: true, paymentStatus: true },
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orderCount: 0, revenue: 0 }));

  for (const order of orders) {
    const hour = getISTHour(order.createdAt); // ← local getHours() ki jagah, ab hamesha IST
    hourly[hour].orderCount += 1;
    // FIX (2026-09-29): revenue sirf PAID orders ka — pehle UNPAID orders bhi
    // jud jaate the, to hourly ka total daily-summary ke totalSales se zyada
    // aata tha (dashboard pe do alag numbers). orderCount mein sab active orders.
    if (order.paymentStatus === "PAID") hourly[hour].revenue += order.netAmount;
  }

  return hourly.map((h) => ({ ...h, revenue: round2(h.revenue) }));
}