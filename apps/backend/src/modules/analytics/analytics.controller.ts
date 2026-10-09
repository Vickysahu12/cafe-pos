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
import * as insightsService from "./insights.service"; // ADDED (2026-10-09): Reports batch 1

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
// ─────────────────────────────────────────────────────────
// ADDED (2026-10-09): Reports batch 1 — insights.service.ts
// `period` sirf whitelist se (today | yesterday | 7d | 30d) — koi lamba range bhej ke
// bhaari query nahi chala sakta. outletId hamesha token se (doosre cafe ka data impossible).
// ─────────────────────────────────────────────────────────
function parsePeriod(value: unknown): insightsService.InsightPeriod | null {
  const p = value === undefined ? "today" : String(value);
  return (insightsService.INSIGHT_PERIODS as readonly string[]).includes(p) ? (p as insightsService.InsightPeriod) : null;
}

export const getInsights = asyncHandler(async (req: Request, res: Response) => {
  const period = parsePeriod(req.query.period);
  if (!period) return sendError(res, "period must be today, yesterday, 7d or 30d", 400);
  const data = await insightsService.getInsights(req.user!.outletId, period);
  return sendSuccess(res, data);
});

export const getTodayCompare = asyncHandler(async (req: Request, res: Response) => {
  const data = await insightsService.getTodayCompare(req.user!.outletId);
  return sendSuccess(res, data);
});

export const exportCsv = asyncHandler(async (req: Request, res: Response) => {
  const period = parsePeriod(req.query.period);
  if (!period) return sendError(res, "period must be today, yesterday, 7d or 30d", 400);
  const kind = req.query.type === undefined ? "orders" : String(req.query.type);
  if (kind !== "orders" && kind !== "items") return sendError(res, "type must be orders or items", 400);
  const { filename, csv } = await insightsService.exportCsv(req.user!.outletId, period, kind);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store"); // sales data kisi proxy/cache mein na reh jaaye
  return res.status(200).send(csv);
});
