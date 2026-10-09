/**
 * INSIGHTS SERVICE — Owner ka "Reports" tab (batch 1)
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-09): Petpooja-level reports, ek hi API call mein:
 *   - KPIs + "kal isi waqt tak" / "pichle hafte isi din" comparison
 *   - Busy hours heatmap (din × ghanta, pichle 4 poore hafte ka average)
 *   - Item performance: best sellers, slow movers, category split
 *   - Counter vs QR orders, dine-in vs takeaway
 *   - Staff performance (kisne kitna bill kiya, kitna discount diya, kitne void kiye)
 *   - Money leaks: discounts, cancellations (reason ke saath), unpaid bills
 *   - Daily closing (Today/Yesterday): cash / UPI / card collection, pehla-aakhri order
 *   + CSV export (orders / item sales) — Excel / CA ke liye
 *
 * EDGE CASES jo socha gaya:
 *  - Comparison FAIR hai: aaj 2 baje tak ka data kal ke POORE din se compare nahi hota
 *    (warna har subah "-80%" dikhta). Aaj (abhi tak) vs kal (isi time tak). 7/30 din wala
 *    bhi same — pichle period ka utna hi hissa jitna current mein beeta hai.
 *  - "Din" = IST calendar din (server UTC pe hai). SQL mein `AT TIME ZONE 'Asia/Kolkata'`.
 *  - Heatmap 28 din = har weekday exactly 4 baar → average sahi (30 din mein kuch din 5 baar aate).
 *    Aaj ka adhoora din heatmap mein nahi (kal tak ke poore din).
 *  - Revenue = PAID + non-cancelled (daily-summary / sales-report jaisa — saari screens match).
 *    Item sales = non-cancelled orders (unpaid bhi — khana to bana). Category share item
 *    totals pe hai (tax/discount se pehle) — mobile pe yeh likha hai.
 *  - QR order = cashierId null (2026-10-09 se owner/manager orders pe bhi cashierId set hota hai).
 *  - Removed staff (isActive false) ka purana data bhi dikhta hai, "(removed)" ke saath.
 *  - Cancelled + paid = REFUNDED — alag se dikhaya (sabse risky case: paisa liya, order void).
 *  - Sab kuch DB ke andar SQL/groupBy se — 1000 cafes pe bhi orders JS mein load nahi hote
 *    (sirf export, jo max 31 din aur row-cap ke saath hai).
 *
 * CONNECTED TO: analytics.controller.ts (getInsights, getTodayCompare, exportCsv),
 * utils/date.ts, utils/money.ts. Mobile: features/analytics/analytics.api.ts → app/(admin)/sales-report.tsx
 */

import { prisma } from "../../config/db";
import { getISTDayRangeUTC, formatISTDate } from "../../utils/date";
import { round2 } from "../../utils/money";

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const INSIGHT_PERIODS = ["today", "yesterday", "7d", "30d"] as const;
export type InsightPeriod = (typeof INSIGHT_PERIODS)[number];

interface Range {
  period: InsightPeriod;
  days: number;
  start: Date;
  end: Date; // inclusive; "today"/"7d"/"30d" ke liye = abhi (adhoora din)
  prevStart: Date;
  prevEnd: Date;
  /** Sirf ek-din wale periods: pichle hafte ka wahi weekday, utne hi time tak */
  lastWeek: { start: Date; end: Date } | null;
  isLive: boolean; // period mein aaj shamil hai (abhi bhi chal raha)
}

/** Period → UTC instants. Comparison range hamesha utni hi lambi jitna current beeta hai. */
export function resolveRange(period: InsightPeriod, now: Date = new Date()): Range {
  const todayStart = getISTDayRangeUTC(now).start;
  const days = period === "30d" ? 30 : period === "7d" ? 7 : 1;
  let start: Date;
  let end: Date;
  if (period === "yesterday") {
    start = new Date(todayStart.getTime() - DAY_MS);
    end = new Date(todayStart.getTime() - 1);
  } else {
    start = new Date(todayStart.getTime() - (days - 1) * DAY_MS);
    end = now;
  }
  const shift = days * DAY_MS;
  const lastWeek =
    days === 1 ? { start: new Date(start.getTime() - 7 * DAY_MS), end: new Date(end.getTime() - 7 * DAY_MS) } : null;
  return {
    period,
    days,
    start,
    end,
    prevStart: new Date(start.getTime() - shift),
    prevEnd: new Date(end.getTime() - shift),
    lastWeek,
    isLive: period !== "yesterday",
  };
}

/** UTC instant → "HH:mm" IST (pehla/aakhri order, cancellation time) */
function istTime(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(11, 16);
}

interface TotalsRow {
  revenue: number;
  orders: number;
  paid_orders: number;
}

async function totalsBetween(outletId: string, start: Date, end: Date): Promise<TotalsRow> {
  const rows = await prisma.$queryRaw<TotalsRow[]>`
    SELECT
      COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS revenue,
      COUNT(*) FILTER (WHERE "orderStatus" <> 'CANCELLED')::int AS orders,
      COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED')::int AS paid_orders
    FROM orders
    WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
  `;
  return rows[0] ?? { revenue: 0, orders: 0, paid_orders: 0 };
}

function shapeTotals(t: TotalsRow) {
  return {
    revenue: round2(t.revenue),
    orders: t.orders,
    avgBill: t.paid_orders > 0 ? round2(t.revenue / t.paid_orders) : 0,
  };
}

// ─────────────────────────────────────────────────────────
// Dashboard ka chhota comparison — "₹4,200 · +12% vs same time yesterday"
// Halka (1 SQL), kyunki Dashboard har focus pe load hota hai.
// ─────────────────────────────────────────────────────────
export async function getTodayCompare(outletId: string, now: Date = new Date()) {
  const r = resolveRange("today", now);
  const [today, yesterday, lastWeek] = await Promise.all([
    totalsBetween(outletId, r.start, r.end),
    totalsBetween(outletId, r.prevStart, r.prevEnd),
    totalsBetween(outletId, r.lastWeek!.start, r.lastWeek!.end),
  ]);
  return {
    asOf: istTime(now),
    today: shapeTotals(today),
    yesterday: shapeTotals(yesterday),
    lastWeek: shapeTotals(lastWeek),
  };
}

// ─────────────────────────────────────────────────────────
// Poora Reports payload
// ─────────────────────────────────────────────────────────
export async function getInsights(outletId: string, period: InsightPeriod, now: Date = new Date()) {
  const r = resolveRange(period, now);
  const { start, end } = r;
  // Heatmap: kal tak ke 28 poore din (har weekday 4 baar)
  const todayStart = getISTDayRangeUTC(now).start;
  const heatStart = new Date(todayStart.getTime() - 28 * DAY_MS);
  const heatEnd = new Date(todayStart.getTime() - 1);

  const [
    cur,
    prev,
    lastWeek,
    dailyRows,
    hourlyRows,
    heatRows,
    itemRows,
    categoryRows,
    payGroups,
    channelRows,
    staffRows,
    leakRow,
    auditRows,
    firstLast,
    stockRow,
    coverRow,
  ] = await Promise.all([
    totalsBetween(outletId, start, end),
    totalsBetween(outletId, r.prevStart, r.prevEnd),
    r.lastWeek ? totalsBetween(outletId, r.lastWeek.start, r.lastWeek.end) : Promise.resolve(null),

    prisma.$queryRaw<{ day: string; orders: number; revenue: number }[]>`
      SELECT
        to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
        COUNT(*) FILTER (WHERE "orderStatus" <> 'CANCELLED')::int AS orders,
        COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS revenue
      FROM orders
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY 1
    `,

    prisma.$queryRaw<{ hour: number; orders: number; revenue: number }[]>`
      SELECT
        EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int AS hour,
        COUNT(*) FILTER (WHERE "orderStatus" <> 'CANCELLED')::int AS orders,
        COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS revenue
      FROM orders
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
      GROUP BY 1
    `,

    // DOW: Postgres 0 = Sunday → neeche Monday-first mein badalte hain
    prisma.$queryRaw<{ dow: number; hour: number; orders: number }[]>`
      SELECT
        EXTRACT(DOW FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int AS dow,
        EXTRACT(HOUR FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int AS hour,
        COUNT(*)::int AS orders
      FROM orders
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${heatStart} AND "createdAt" <= ${heatEnd}
        AND "orderStatus" <> 'CANCELLED'
      GROUP BY 1, 2
    `,

    // Har available menu item ki bikri (0 wale bhi — slow movers ke liye LEFT JOIN).
    // Archived/unavailable items slow-mover list mein nahi aane chahiye (owner ne khud band kiye),
    // par agar period mein bike the to best-seller mein aa sakte hain.
    prisma.$queryRaw<
      { product_id: string; name: string; category: string; quantity: number; revenue: number; listed: boolean }[]
    >`
      SELECT
        p.id AS product_id,
        p.name,
        c.name AS category,
        COALESCE(s.quantity, 0)::int AS quantity,
        COALESCE(s.revenue, 0)::float AS revenue,
        (p."archivedAt" IS NULL AND p."isAvailable" AND c."archivedAt" IS NULL AND c."isAvailable") AS listed
      FROM products p
      JOIN categories c ON c.id = p."categoryId"
      LEFT JOIN (
        SELECT oi."productId", SUM(oi.quantity) AS quantity, SUM(oi."totalPrice") AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi."orderId"
        WHERE o."outletId" = ${outletId}
          AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
          AND o."orderStatus" <> 'CANCELLED'
        GROUP BY oi."productId"
      ) s ON s."productId" = p.id
      WHERE p."outletId" = ${outletId}
        AND (s.quantity IS NOT NULL OR (p."archivedAt" IS NULL AND p."isAvailable" AND c."archivedAt" IS NULL AND c."isAvailable"))
    `,

    prisma.$queryRaw<{ name: string; quantity: number; revenue: number }[]>`
      SELECT c.name, SUM(oi.quantity)::int AS quantity, COALESCE(SUM(oi."totalPrice"), 0)::float AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      JOIN categories c ON c.id = p."categoryId"
      WHERE o."outletId" = ${outletId}
        AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
        AND o."orderStatus" <> 'CANCELLED'
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `,

    prisma.order.groupBy({
      by: ["paymentMethod"],
      where: { outletId, createdAt: { gte: start, lte: end }, paymentStatus: "PAID", orderStatus: { not: "CANCELLED" } },
      _sum: { netAmount: true },
      _count: { _all: true },
    }),

    prisma.$queryRaw<{ qr: boolean; type: string; orders: number; revenue: number }[]>`
      SELECT
        ("cashierId" IS NULL) AS qr,
        "orderType"::text AS type,
        COUNT(*)::int AS orders,
        COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'PAID'), 0)::float AS revenue
      FROM orders
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        AND "orderStatus" <> 'CANCELLED'
      GROUP BY 1, 2
    `,

    // Staff: jisne bill banaya (cashierId) — orders, revenue, unke bills jo baad mein cancel hue
    prisma.$queryRaw<
      { user_id: string; orders: number; revenue: number; paid_orders: number; voided: number; voided_amount: number }[]
    >`
      SELECT
        "cashierId" AS user_id,
        COUNT(*) FILTER (WHERE "orderStatus" <> 'CANCELLED')::int AS orders,
        COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS revenue,
        COUNT(*) FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED')::int AS paid_orders,
        COUNT(*) FILTER (WHERE "orderStatus" = 'CANCELLED')::int AS voided,
        COALESCE(SUM("netAmount") FILTER (WHERE "orderStatus" = 'CANCELLED'), 0)::float AS voided_amount
      FROM orders
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        AND "cashierId" IS NOT NULL
      GROUP BY 1
    `,

    prisma.$queryRaw<
      {
        discount_amount: number;
        discount_orders: number;
        cancelled: number;
        cancelled_amount: number;
        refunded: number;
        refunded_amount: number;
        unpaid: number;
        unpaid_amount: number;
        gross_paid: number;
        items_sold: number;
      }[]
    >`
      SELECT
        COALESCE(SUM("discountAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS discount_amount,
        COUNT(*) FILTER (WHERE "discountAmount" > 0 AND "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED')::int AS discount_orders,
        COUNT(*) FILTER (WHERE "orderStatus" = 'CANCELLED')::int AS cancelled,
        COALESCE(SUM("netAmount") FILTER (WHERE "orderStatus" = 'CANCELLED'), 0)::float AS cancelled_amount,
        COUNT(*) FILTER (WHERE "paymentStatus" = 'REFUNDED')::int AS refunded,
        COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" = 'REFUNDED'), 0)::float AS refunded_amount,
        COUNT(*) FILTER (WHERE "paymentStatus" IN ('UNPAID', 'PARTIAL') AND "orderStatus" <> 'CANCELLED')::int AS unpaid,
        COALESCE(SUM("netAmount") FILTER (WHERE "paymentStatus" IN ('UNPAID', 'PARTIAL') AND "orderStatus" <> 'CANCELLED'), 0)::float AS unpaid_amount,
        COALESCE(SUM("totalAmount" + "taxAmount") FILTER (WHERE "paymentStatus" = 'PAID' AND "orderStatus" <> 'CANCELLED'), 0)::float AS gross_paid,
        COALESCE((
          SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o2 ON o2.id = oi."orderId"
          WHERE o2."outletId" = ${outletId} AND o2."createdAt" >= ${start} AND o2."createdAt" <= ${end}
            AND o2."orderStatus" <> 'CANCELLED'
        ), 0)::int AS items_sold
      FROM orders
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    `,

    // Kisne discount diya / void kiya — audit log (order pe sirf banane wala hota hai)
    prisma.auditLog.findMany({
      where: {
        outletId,
        action: { in: ["APPLY_DISCOUNT", "CANCEL_ORDER"] },
        timestamp: { gte: start, lte: end },
      },
      orderBy: { timestamp: "desc" },
      take: 500, // ek din/mahine mein isse zyada void/discount = upar ke 500 kaafi (list mein 10 hi dikhte)
      select: { userId: true, action: true, metadata: true, timestamp: true },
    }),

    prisma.order.aggregate({
      where: { outletId, createdAt: { gte: start, lte: end }, orderStatus: { not: "CANCELLED" } },
      _min: { createdAt: true },
      _max: { createdAt: true },
    }),

    // ADDED (2026-10-09): STOCK SOP — ledger se ₹. Cost us waqt ka (movement.unitCost).
    //   cogs     = SALE − SALE_REVERSAL (cancel hue orders ka maal wapas / wastage mein gaya)
    //   wastage  = WASTAGE (gira/kharab + "khana ban chuka tha" wale cancel)
    //   missing  = stock count mein jo kam nikla (variance −)
    prisma.$queryRaw<{ cogs: number; wastage: number; count_missing: number; count_extra: number; moves: number }[]>`
      SELECT
        (COALESCE(SUM(-quantity * "unitCost") FILTER (WHERE type = 'SALE'), 0)
          - COALESCE(SUM(quantity * "unitCost") FILTER (WHERE type = 'SALE_REVERSAL'), 0))::float AS cogs,
        COALESCE(SUM(-quantity * "unitCost") FILTER (WHERE type = 'WASTAGE'), 0)::float AS wastage,
        COALESCE(SUM(quantity * "unitCost") FILTER (WHERE type = 'COUNT' AND quantity < 0), 0)::float AS count_missing,
        COALESCE(SUM(quantity * "unitCost") FILTER (WHERE type = 'COUNT' AND quantity > 0), 0)::float AS count_extra,
        COUNT(*)::int AS moves
      FROM stock_movements
      WHERE "outletId" = ${outletId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    `,

    // Food cost % sirf un sales pe jinka stock sach mein kata (recipe wale items, aur order pe
    // SALE movement bani) — beech mahine recipe jodi ho to purani bina-cost sales % ko jhootha
    // kam na dikhayein.
    prisma.$queryRaw<{ covered: number; total: number }[]>`
      SELECT
        COALESCE(SUM(oi."totalPrice") FILTER (
          WHERE EXISTS (SELECT 1 FROM recipe_lines rl WHERE rl."productId" = oi."productId")
            AND EXISTS (SELECT 1 FROM stock_movements sm WHERE sm."orderId" = o.id AND sm.type = 'SALE')
        ), 0)::float AS covered,
        COALESCE(SUM(oi."totalPrice"), 0)::float AS total
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."outletId" = ${outletId} AND o."createdAt" >= ${start} AND o."createdAt" <= ${end}
        AND o."orderStatus" <> 'CANCELLED'
    `,
  ]);

  // ── KPIs ──────────────────────────────────────────────
  const kpis = {
    ...shapeTotals(cur),
    paidOrders: cur.paid_orders,
    itemsSold: leakRow[0]?.items_sold ?? 0,
    itemsPerOrder: cur.orders > 0 ? round2((leakRow[0]?.items_sold ?? 0) / cur.orders) : 0,
  };

  // ── Daily series (7d/30d graph) — khaali din bhi 0 ke saath ──
  const byDay = new Map(dailyRows.map((d) => [d.day, d]));
  const series = Array.from({ length: r.days }, (_, i) => {
    const date = formatISTDate(new Date(start.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000));
    const d = byDay.get(date);
    return { date, revenue: round2(d?.revenue ?? 0), orders: d?.orders ?? 0 };
  });

  // ── Hourly (period ka jod) ──
  const byHour = new Map(hourlyRows.map((h) => [h.hour, h]));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: byHour.get(hour)?.orders ?? 0,
    revenue: round2(byHour.get(hour)?.revenue ?? 0),
  }));

  // ── Heatmap: 7 rows (Mon..Sun) × 24 hours, avg orders per din ──
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const h of heatRows) heat[(h.dow + 6) % 7][h.hour] = round2(h.orders / 4);
  const heatHasData = heatRows.length > 0;
  let peak: { day: number; hour: number; avgOrders: number } | null = null;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (heat[d][h] > 0 && (!peak || heat[d][h] > peak.avgOrders)) peak = { day: d, hour: h, avgOrders: heat[d][h] };
    }
  }

  // ── Items ──
  const totalItemRevenue = itemRows.reduce((s, i) => s + i.revenue, 0);
  const sold = itemRows.filter((i) => i.quantity > 0);
  const top = [...sold]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, 10)
    .map((i) => ({
      productId: i.product_id,
      name: i.name,
      category: i.category,
      quantity: i.quantity,
      revenue: round2(i.revenue),
      share: totalItemRevenue > 0 ? round2((i.revenue / totalItemRevenue) * 100) : 0,
    }));
  const topIds = new Set(top.map((t) => t.productId));
  // Slow movers: sirf abhi menu pe (listed) items, best-sellers ke alawa, sabse kam bike pehle.
  // Chhote menu (<= 10 items) pe "slow" ka matlab nahi banta jab sab top list mein hain.
  const slow = itemRows
    .filter((i) => i.listed && !topIds.has(i.product_id))
    .sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((i) => ({ productId: i.product_id, name: i.name, category: i.category, quantity: i.quantity, revenue: round2(i.revenue) }));
  const listedCount = itemRows.filter((i) => i.listed).length;
  const notSoldCount = itemRows.filter((i) => i.listed && i.quantity === 0).length;
  const categories = categoryRows.map((c) => ({
    name: c.name,
    quantity: c.quantity,
    revenue: round2(c.revenue),
    share: totalItemRevenue > 0 ? round2((c.revenue / totalItemRevenue) * 100) : 0,
  }));

  // ── Payment split ──
  const paymentSplit = { cash: 0, upi: 0, card: 0, other: 0 };
  const paymentCounts = { cash: 0, upi: 0, card: 0, other: 0 };
  for (const g of payGroups) {
    const key = g.paymentMethod === "CASH" ? "cash" : g.paymentMethod === "UPI" ? "upi" : g.paymentMethod === "CARD" ? "card" : "other";
    paymentSplit[key] = round2(paymentSplit[key] + (g._sum.netAmount ?? 0));
    paymentCounts[key] += g._count._all;
  }

  // ── Channels / order types ──
  const channels = { counter: { orders: 0, revenue: 0 }, qr: { orders: 0, revenue: 0 } };
  const orderTypes: Record<string, { orders: number; revenue: number }> = {};
  for (const c of channelRows) {
    const ch = c.qr ? channels.qr : channels.counter;
    ch.orders += c.orders;
    ch.revenue = round2(ch.revenue + c.revenue);
    const t = (orderTypes[c.type] ??= { orders: 0, revenue: 0 });
    t.orders += c.orders;
    t.revenue = round2(t.revenue + c.revenue);
  }

  // ── Audit: discounts + cancellations by user ──
  type Meta = { orderNumber?: number; discountAmount?: number; grossAmount?: number; reason?: string; wasPaid?: boolean; netAmount?: number };
  const discountsBy = new Map<string, { count: number; amount: number }>();
  const cancelsBy = new Map<string, { count: number; amount: number }>();
  const recentDiscounts: { at: string; date: string; orderNumber: number | null; userId: string; amount: number; percent: number }[] = [];
  const recentCancellations: { at: string; date: string; orderNumber: number | null; userId: string; reason: string; amount: number; wasPaid: boolean }[] = [];
  for (const a of auditRows) {
    const m = (a.metadata ?? {}) as Meta;
    if (a.action === "APPLY_DISCOUNT") {
      const amount = Number(m.discountAmount) || 0;
      const e = discountsBy.get(a.userId) ?? { count: 0, amount: 0 };
      e.count += 1;
      e.amount += amount;
      discountsBy.set(a.userId, e);
      if (recentDiscounts.length < 10) {
        const gross = Number(m.grossAmount) || 0;
        recentDiscounts.push({
          at: istTime(a.timestamp),
          date: formatISTDate(a.timestamp),
          orderNumber: typeof m.orderNumber === "number" ? m.orderNumber : null,
          userId: a.userId,
          amount: round2(amount),
          percent: gross > 0 ? Math.round((amount / gross) * 100) : 0,
        });
      }
    } else {
      const amount = Number(m.netAmount) || 0;
      const e = cancelsBy.get(a.userId) ?? { count: 0, amount: 0 };
      e.count += 1;
      e.amount += amount;
      cancelsBy.set(a.userId, e);
      if (recentCancellations.length < 10) {
        recentCancellations.push({
          at: istTime(a.timestamp),
          date: formatISTDate(a.timestamp),
          orderNumber: typeof m.orderNumber === "number" ? m.orderNumber : null,
          userId: a.userId,
          reason: typeof m.reason === "string" && m.reason.trim() ? m.reason.trim() : "No reason given",
          amount: round2(amount),
          wasPaid: m.wasPaid === true,
        });
      }
    }
  }

  // Naam ek hi query mein (sirf isi outlet ke users — doosre outlet ka naam kabhi leak nahi)
  const userIds = new Set<string>([
    ...staffRows.map((s) => s.user_id),
    ...discountsBy.keys(),
    ...cancelsBy.keys(),
  ]);
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] }, outletId },
        select: { id: true, name: true, role: true, isActive: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));
  const nameOf = (id: string) => userById.get(id)?.name ?? "Unknown";

  const staff = [...userIds]
    .filter((id) => userById.has(id))
    .map((id) => {
      const u = userById.get(id)!;
      const s = staffRows.find((x) => x.user_id === id);
      const d = discountsBy.get(id);
      const c = cancelsBy.get(id);
      return {
        userId: id,
        name: u.name,
        role: u.role,
        isActive: u.isActive,
        orders: s?.orders ?? 0,
        revenue: round2(s?.revenue ?? 0),
        avgBill: s && s.paid_orders > 0 ? round2(s.revenue / s.paid_orders) : 0,
        billsVoided: s?.voided ?? 0, // inke banaye bills jo baad mein cancel hue
        billsVoidedAmount: round2(s?.voided_amount ?? 0),
        discountsGiven: d?.count ?? 0,
        discountAmount: round2(d?.amount ?? 0),
        cancelsDone: c?.count ?? 0, // inhone khud void kiye (Owner/Manager)
        cancelsAmount: round2(c?.amount ?? 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);

  // ── Money leaks ──
  const l = leakRow[0];
  const leakage = {
    discounts: {
      amount: round2(l?.discount_amount ?? 0),
      orders: l?.discount_orders ?? 0,
      // Gross (tax ke saath) ka kitna % discount mein gaya
      percentOfSales: l && l.gross_paid > 0 ? round2((l.discount_amount / l.gross_paid) * 100) : 0,
    },
    cancelled: { count: l?.cancelled ?? 0, amount: round2(l?.cancelled_amount ?? 0) },
    refunded: { count: l?.refunded ?? 0, amount: round2(l?.refunded_amount ?? 0) },
    unpaid: { count: l?.unpaid ?? 0, amount: round2(l?.unpaid_amount ?? 0) },
    recentDiscounts: recentDiscounts.map(({ userId, ...rest }) => ({ ...rest, by: nameOf(userId) })),
    recentCancellations: recentCancellations.map(({ userId, ...rest }) => ({ ...rest, by: nameOf(userId) })),
  };

  // ── Closing (sirf ek-din wale periods) ──
  const closing =
    r.days === 1
      ? {
          date: formatISTDate(start),
          isLive: r.isLive,
          asOf: r.isLive ? istTime(now) : null,
          collected: round2(paymentSplit.cash + paymentSplit.upi + paymentSplit.card + paymentSplit.other),
          cash: { amount: paymentSplit.cash, orders: paymentCounts.cash },
          upi: { amount: paymentSplit.upi, orders: paymentCounts.upi },
          card: { amount: paymentSplit.card, orders: paymentCounts.card },
          other: { amount: paymentSplit.other, orders: paymentCounts.other },
          firstOrderAt: firstLast._min.createdAt ? istTime(firstLast._min.createdAt) : null,
          lastOrderAt: firstLast._max.createdAt ? istTime(firstLast._max.createdAt) : null,
        }
      : null;

  // ── Stock / profit (STOCK SOP, 2026-10-09) ──
  const sr = stockRow[0];
  const cv = coverRow[0];
  const cogs = round2(Math.max(0, sr?.cogs ?? 0));
  const covered = round2(cv?.covered ?? 0);
  const stock = {
    hasData: (sr?.moves ?? 0) > 0,
    cogs, // recipe se kata maal (₹, cost price pe)
    coveredSales: covered, // un items ki sales jinki recipe hai (tax/discount se pehle)
    coveragePct: cv && cv.total > 0 ? round2((covered / cv.total) * 100) : 0,
    foodCostPct: covered > 0 ? round2((cogs / covered) * 100) : 0,
    grossProfit: round2(covered - cogs),
    wastageValue: round2(Math.max(0, sr?.wastage ?? 0)),
    countMissingValue: round2(Math.abs(sr?.count_missing ?? 0)),
    countExtraValue: round2(sr?.count_extra ?? 0),
  };

  return {
    period,
    from: formatISTDate(start),
    to: formatISTDate(end),
    isLive: r.isLive,
    asOf: istTime(now),
    kpis,
    previous: shapeTotals(prev),
    lastWeek: lastWeek ? shapeTotals(lastWeek) : null,
    series,
    hourly,
    heatmap: { days: heatHasData ? 28 : 0, from: formatISTDate(heatStart), to: formatISTDate(heatEnd), avgOrders: heat, peak },
    items: { top, slow, categories, listedCount, notSoldCount },
    paymentSplit,
    channels,
    orderTypes,
    staff,
    leakage,
    stock, // ADDED (2026-10-09)
    closing,
  };
}

// ─────────────────────────────────────────────────────────
// CSV EXPORT — Excel / Google Sheets / CA ke liye
// ─────────────────────────────────────────────────────────
// - UTF-8 BOM: Excel ₹ aur Hindi naam sahi dikhaye
// - Formula injection se bachav: "=", "+", "-", "@" se shuru hone wale TEXT fields ke aage '
//   (koi customer naam "=HYPERLINK(...)" daal de to Excel mein chalega nahi)
// - Customer PHONE kabhi export nahi hota (privacy / DPDP — sirf naam)
// - Numbers plain (1234.5) — Excel mein SUM chal sake, "₹1,234.50" text nahi
// - Max 20,000 orders — itna ek cafe 30 din mein kabhi nahi karta; zyada ho to cut + last line mein note

const EXPORT_ROW_CAP = 20_000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells: unknown[]): string {
  return cells.map(csvCell).join(",");
}

const TYPE_LABEL: Record<string, string> = { DINE_IN: "Dine-in", TAKEAWAY: "Takeaway", DELIVERY: "Delivery" };

export async function exportCsv(outletId: string, period: InsightPeriod, kind: "orders" | "items", now: Date = new Date()) {
  const r = resolveRange(period, now);
  const fileBase = `billraw-${kind}-${formatISTDate(r.start)}${r.days > 1 ? `_to_${formatISTDate(r.end)}` : ""}`;

  if (kind === "items") {
    const rows = await prisma.$queryRaw<{ name: string; category: string; quantity: number; revenue: number }[]>`
      SELECT p.name, c.name AS category, SUM(oi.quantity)::int AS quantity, COALESCE(SUM(oi."totalPrice"), 0)::float AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      JOIN products p ON p.id = oi."productId"
      JOIN categories c ON c.id = p."categoryId"
      WHERE o."outletId" = ${outletId}
        AND o."createdAt" >= ${r.start} AND o."createdAt" <= ${r.end}
        AND o."orderStatus" <> 'CANCELLED'
      GROUP BY p.id, p.name, c.name
      ORDER BY quantity DESC, revenue DESC
    `;
    const lines = [csvLine(["Item", "Category", "Quantity sold", "Item sales (before tax & discount)"])];
    for (const x of rows) lines.push(csvLine([x.name, x.category, x.quantity, round2(x.revenue)]));
    return { filename: `${fileBase}.csv`, csv: "﻿" + lines.join("\r\n") + "\r\n", rows: rows.length };
  }

  const orders = await prisma.order.findMany({
    where: { outletId, createdAt: { gte: r.start, lte: r.end } },
    orderBy: { createdAt: "asc" },
    take: EXPORT_ROW_CAP + 1,
    select: {
      orderNumber: true,
      createdAt: true,
      orderType: true,
      orderStatus: true,
      paymentStatus: true,
      paymentMethod: true,
      totalAmount: true,
      taxAmount: true,
      discountAmount: true,
      netAmount: true,
      customerName: true, // phone NAHI
      cashierId: true,
      table: { select: { tableNumber: true } },
      cashier: { select: { name: true } },
      items: { select: { quantity: true, variantName: true, product: { select: { name: true } } } }, // variantName: 2026-10-09
    },
  });
  const truncated = orders.length > EXPORT_ROW_CAP;
  const list = truncated ? orders.slice(0, EXPORT_ROW_CAP) : orders;

  const lines = [
    csvLine([
      "Date", "Time", "Order #", "Source", "Type", "Table", "Customer name", "Status", "Payment",
      "Method", "Items", "Subtotal", "Tax", "Discount", "Net amount", "Billed by",
    ]),
  ];
  for (const o of list) {
    lines.push(
      csvLine([
        formatISTDate(o.createdAt),
        istTime(o.createdAt),
        o.orderNumber,
        o.cashierId ? "Counter" : "QR",
        TYPE_LABEL[o.orderType] ?? o.orderType,
        o.table?.tableNumber ?? "",
        o.customerName ?? "",
        o.orderStatus.charAt(0) + o.orderStatus.slice(1).toLowerCase(),
        o.paymentStatus.charAt(0) + o.paymentStatus.slice(1).toLowerCase(),
        o.paymentMethod ?? "",
        o.items.map((i) => `${i.quantity}x ${i.product.name}${i.variantName ? ` (${i.variantName})` : ""}`).join("; "),
        round2(o.totalAmount),
        round2(o.taxAmount),
        round2(o.discountAmount),
        round2(o.netAmount),
        o.cashier?.name ?? (o.cashierId ? "" : "QR (customer)"),
      ])
    );
  }
  if (truncated) lines.push(csvLine([`Only the first ${EXPORT_ROW_CAP} orders are included. Export a shorter period for the rest.`]));
  return { filename: `${fileBase}.csv`, csv: "﻿" + lines.join("\r\n") + "\r\n", rows: list.length };
}
