/**
 * ANALYTICS CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — analytics.service.ts ko call karta hai.
 * Query param `date` optional hai (YYYY-MM-DD) — na diya toh aaj ka
 * din use hota hai.
 *
 * CONNECTED TO:
 * - analytics.service.ts → business logic
 * - analytics.routes.ts    → handlers yahan se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as analyticsService from "./analytics.service";

export const getDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const summary = await analyticsService.getDailySummary(req.user!.outletId, date);
  return sendSuccess(res, summary);
});

export const getHourlySales = asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date ? new Date(req.query.date as string) : new Date();
  const hourly = await analyticsService.getHourlySales(req.user!.outletId, date);
  return sendSuccess(res, hourly);
});