import { prisma } from "../config/db";
import type { Prisma } from "@prisma/client"; // ← naya import

export async function logAuditAction(params: {
  userId: string;
  outletId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      outletId: params.outletId,
      action: params.action,
      metadata: params.metadata as Prisma.InputJsonValue | undefined, // ← cast add kiya
    },
  });
}