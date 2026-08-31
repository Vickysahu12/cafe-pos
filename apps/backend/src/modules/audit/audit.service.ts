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

/**
 * USE CASE: Outlet ke audit logs list karta hai, filters ke saath —
 * Owner ka "Audit Logs" dashboard screen isi se banega. User ka naam
 * bhi saath mein deta hai taaki frontend ko alag se lookup na karna pade.
 */
export async function getAuditLogs(
  outletId: string,
  filters: { action?: string; dateFrom?: Date; dateTo?: Date }
) {
  return prisma.auditLog.findMany({
    where: {
      outletId,
      action: filters.action,
      timestamp:
        filters.dateFrom || filters.dateTo
          ? { gte: filters.dateFrom, lte: filters.dateTo }
          : undefined,
    },
    include: { user: { select: { name: true, role: true } } },
    orderBy: { timestamp: "desc" },
  });
}