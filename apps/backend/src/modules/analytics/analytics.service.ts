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
// ─────────────────────────────────────────────────────────
// ADDED (2026-09-30): SALES REPORT — Owner ka "Net Revenue" tap karke khulne wala
// screen (7 / 30 din ka daily graph). Pehle sirf AAJ ka summary tha; owner ko
// "is hafte kitna kamaya, kaunsa din best" dekhne ka koi tarika nahi tha.
//
// Performance (1000 cafes scale): saara jod DB ke andar SQL se hota hai (GROUP BY
// IST din) — hazaaron orders JS mein load nahi karte. `orders(outletId, createdAt)`
// index already hai (schema.prisma), isliye range query fast hai.
//
// Definitions (daily-summary jaisi hi, taaki dono screens ke numbers match karein):
//   revenue = PAID + non-cancelled orders ka netAmount
//   orders  = non-cancelled orders (paid + unpaid)
// ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
export const REPORT_DAY_OPTIONS = [7, 30] as const;

interface DayRow {
  day: string;
  orders: number;
  paid_orders: number;
  revenue: number;
}

async function aggregateByDay(outletId: string, start: Date, end: Date): Promise<DayRow[]> {
  // createdAt UTC mein store hota hai → IST calendar din mein group
  return prisma.$queryRaw<DayRow[]>`
    SELECT
      to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE "orderStatus" <> 'CANCELLED')::int AS orders,
      COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED')::int AS paid_orders,
      COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS revenue
    FROM orders
    WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    GROUP BY 1
  `;
}

export async function getSalesReport(outletId: string, days: number) {
  const today = new Date();
  const { end } = getISTDayRangeUTC(today);
  const { start } = getISTDayRangeUTC(new Date(today.getTime() - (days - 1) * DAY_MS));
  // Pichla barabar period — "+12% vs last week" ke liye
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(start.getTime() - days * DAY_MS);

  const [rows, prevRows, paymentGroups, topItems] = await Promise.all([
    aggregateByDay(outletId, start, end),
    aggregateByDay(outletId, prevStart, prevEnd),
    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: {
        outletId,
        createdAt: { gte: start, lte: end },
        paymentStatus: "PAID",
        orderStatus: { not: "CANCELLED" },
      },
      _sum: { netAmount: true },
    }),
    prisma.$queryRaw<{ name: string; quantity: number; revenue: number }[]>`
      SELECT p.name, SUM(oi.quantity)::int AS quantity, COALESCE(SUM(oi."totalPrice"), 0)::float AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      WHERE o."outletId" = ${outletId}
        AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
        AND o."orderStatus" <> 'CANCELLED'
      GROUP BY p.id, p.name
      ORDER BY quantity DESC, revenue DESC
      LIMIT 5
    `,
  ]);

  // Har din ki entry — jis din koi order nahi, woh 0 (graph mein gap nahi, khaali bar)
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const date = formatISTDate(new Date(start.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000));
    const r = byDay.get(date);
    return { date, revenue: round2(r?.revenue ?? 0), orders: r?.orders ?? 0 };
  });

  const sum = (list: DayRow[]) =>
    list.reduce(
      (acc, r) => ({ revenue: acc.revenue + r.revenue, orders: acc.orders + r.orders, paid: acc.paid + r.paid_orders }),
      { revenue: 0, orders: 0, paid: 0 }
    );
  const cur = sum(rows);
  const prev = sum(prevRows);

  const split = { cash: 0, upi: 0, card: 0, other: 0 };
  for (const g of paymentGroups) {
    const amount = round2(g._sum.netAmount ?? 0);
    if (g.paymentMethod === "CASH") split.cash = amount;
    else if (g.paymentMethod === "UPI") split.upi = amount;
    else if (g.paymentMethod === "CARD") split.card = amount;
    else split.other = round2(split.other + amount);
  }

  return {
    days,
    from: series[0]?.date,
    to: series[series.length - 1]?.date,
    series,
    totals: {
      revenue: round2(cur.revenue),
      orders: cur.orders,
      avgOrderValue: cur.paid > 0 ? round2(cur.revenue / cur.paid) : 0,
    },
    previous: { revenue: round2(prev.revenue), orders: prev.orders },
    paymentSplit: split,
    topItems: topItems.map((t) => ({ name: t.name, quantity: t.quantity, revenue: round2(t.revenue) })),
  };
}
