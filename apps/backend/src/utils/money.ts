/**
 * MONEY UTILS (2026-09-29)
 * ─────────────────────────────────────────────────────────
 * USE CASE: Prisma schema mein amounts abhi `Float` hain, isliye
 * 0.1 + 0.2 = 0.30000000000000004 jaise floating errors bill, GST aur
 * dashboard totals mein aa jaate the. Har calculation ke baad round2() lagao.
 * Yeh temporary guard hai — asli fix Float → Decimal (ya integer paise)
 * migration hai, jo pending hai (dekho docs/progress5.md).
 *
 * CONNECTED TO:
 * - orders.service.ts     → item/tax/net/discount calculation
 * - analytics.service.ts   → daily/hourly totals
 */

/** 2 decimal (paise) tak round karta hai: round2(10.005) → 10.01 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
