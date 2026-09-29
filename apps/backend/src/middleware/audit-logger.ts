import { prisma } from "../config/db";
import type { Prisma } from "@prisma/client"; // ← naya import

// FIX (2026-09-29): optional `db` param — transaction client (tx) pass kar sakte
// ho, taaki audit entry usi transaction mein likhe jismein asli action hua
// (jaise voidOrder). Isse "action ho gaya par audit log nahi bana" wala case
// impossible ho jaata hai. Na diya to global prisma use hota hai (purana behaviour).
export async function logAuditAction(
  params: {
    userId: string;
    outletId: string;
    action: string;
    metadata?: Record<string, unknown>;
  },
  db: Prisma.TransactionClient = prisma
) {
  await db.auditLog.create({
    data: {
      userId: params.userId,
      outletId: params.outletId,
      action: params.action,
      metadata: params.metadata as Prisma.InputJsonValue | undefined, // ← cast add kiya
    },
  });
}
