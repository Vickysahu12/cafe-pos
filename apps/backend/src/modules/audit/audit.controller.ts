/**
 * AUDIT CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — audit.service.ts ko call karta hai.
 *
 * CONNECTED TO:
 * - audit.service.ts → business logic
 * - audit.routes.ts    → handler yahan se attach hota hai
 */

import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess, sendError } from "../../utils/api-response";
import * as auditService from "./audit.service";

// FIX (2026-09-29): galat date (`?dateFrom=kal`) pehle Invalid Date ban ke
// Prisma tak jaati thi → 500. Ab 400.
const AuditQuerySchema = z.object({
  action: z.string().max(50).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const parsed = AuditQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, "Invalid filter values", 400, parsed.error.flatten());
  }
  const logs = await auditService.getAuditLogs(req.user!.outletId, parsed.data);
  return sendSuccess(res, logs);
});
