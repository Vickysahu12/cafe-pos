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
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as auditService from "./audit.service";

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { action, dateFrom, dateTo } = req.query;
  const logs = await auditService.getAuditLogs(req.user!.outletId, {
    action: action as string | undefined,
    dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
    dateTo: dateTo ? new Date(dateTo as string) : undefined,
  });
  return sendSuccess(res, logs);
});