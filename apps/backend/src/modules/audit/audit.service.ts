/**
 * AUDIT SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Audit logs READ karta hai — WRITE (logAuditAction)
 * pehle se middleware/audit-logger.ts mein hai aur Orders module
 * (voidOrder) use kar raha hai. Yeh module sirf Owner ko woh logs
 * DEKHNE deta hai — PRD ka "Zero-Theft Audit Logs" dashboard feature.
 *
 * CONNECTED TO:
 * - config/db.ts        → Prisma client
 * - audit.controller.ts   → HTTP layer isko call karta hai
 * - prisma/schema.prisma   → AuditLog model
 * - middleware/audit-logger.ts → yehi function jo entries banata hai
 */

import { prisma } from "../../config/db";

// The audit_logs table is shared by two very different kinds of entries:
// 1. High-risk STAFF actions (order voids, discounts, deletions) — what this
//    screen exists to show the Owner, per the PRD's "Zero-Theft Audit" feature.
// 2. Legal/compliance entries — e.g. CONSENT_ACCEPTED, written once by
//    auth.service.ts at registration as DPDP Act evidence that notice/consent
//    was given. These must stay in the table for record-keeping, but should
//    never appear next to theft/fraud data — it's a different concern and
//    would just confuse the Owner.
//
// Keep this list in sync with the action strings actually written by
// middleware/audit-logger.ts and orders.service.ts's voidOrder — if a new
// high-risk action is logged there, add it here too, or it'll silently be
// filtered out of this screen.
// FIX (2026-09-29): PRICE_CHANGE (menu price/tax edit) aur RESET_STAFF_PASSWORD
// bhi Owner ko dikhne chahiye — dono theft/misuse ke classic signals hain
const REPORTABLE_ACTIONS = [
  "CANCEL_ORDER",
  "APPLY_DISCOUNT",
  "DELETE_ITEM",
  "PRICE_CHANGE",
  "RESET_STAFF_PASSWORD",
] as const;

/**
 * USE CASE: Outlet ke audit logs list karta hai, filters ke saath —
 * Owner ka "Audit Logs" dashboard screen isi se banega. User ka naam
 * bhi saath mein deta hai taaki frontend ko alag se lookup na karna pade.
 */
export async function getAuditLogs(
  outletId: string,
  filters: { action?: string; dateFrom?: Date; dateTo?: Date }
) {
  // If a specific reportable action was requested, filter to exactly that.
  // Otherwise — including if someone tries to pass a non-reportable action
  // like ?action=CONSENT_ACCEPTED via the query string — fall back to the
  // full whitelist. This means the endpoint can never be used to fetch
  // compliance entries, even by an unexpected query param.
  const action = filters.action && (REPORTABLE_ACTIONS as readonly string[]).includes(filters.action)
    ? filters.action
    : { in: [...REPORTABLE_ACTIONS] };

  return prisma.auditLog.findMany({
    where: {
      outletId,
      action,
      timestamp:
        filters.dateFrom || filters.dateTo
          ? { gte: filters.dateFrom, lte: filters.dateTo }
          : undefined,
    },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { timestamp: "desc" },
    // FIX (2026-09-29): cap — pehle outlet ke saare audit logs (all-time) ek
    // saath aate the; mahino baad yeh list hazaaron rows ki ho jaati
    take: 300,
  });
}