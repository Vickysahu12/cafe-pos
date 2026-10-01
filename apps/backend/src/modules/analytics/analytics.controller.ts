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
import { sendSuccess, sendError } from "../../utils/api-response";
import * as analyticsService from "./analytics.service";

// FIX (2026-09-29): `?date=galat` pehle Invalid Date → toISOString() RangeError
// → 500 crash. Ab null return karke 400 bhejte hain.
function parseDateParam(value: unknown): Date | null {
  if (value === undefined) return new Date();
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export const getDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const date = parseDateParam(req.query.date);
  if (!date) return sendError(res, "Invalid date. Use YYYY-MM-DD.", 400);
  const summary = await analyticsService.getDailySummary(req.user!.outletId, date);
  return sendSuccess(res, summary);
});

// ADDED (2026-09-30): Sales Report (7/30 din). Sirf 7 ya 30 allowed — koi `?days=100000`
// bhej ke bhaari query na chala sake.
export const getSalesReport = asyncHandler(async (req: Request, res: Response) => {
  const days = Number(req.query.days ?? 7);
  if (!(analyticsService.REPORT_DAY_OPTIONS as readonly number[]).includes(days)) {
    return sendError(res, "days must be 7 or 30", 400);
  }
  const report = await analyticsService.getSalesReport(req.user!.outletId, days);
  return sendSuccess(res, report);
});

export const getHourlySales = asyncHandler(async (req: Request, res: Response) => {
  const date = parseDateParam(req.query.date);
  if (!date) return sendError(res, "Invalid date. Use YYYY-MM-DD.", 400);
  const hourly = await analyticsService.getHourlySales(req.user!.outletId, date);
  return sendSuccess(res, hourly);
});