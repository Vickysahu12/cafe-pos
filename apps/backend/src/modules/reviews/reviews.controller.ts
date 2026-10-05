/**
 * REVIEWS CONTROLLER: Owner/Manager side (authenticated)
 * ADDED (2026-10-05). outletId hamesha JWT se (req.user), kabhi body se nahi.
 * CONNECTED TO: reviews.service.ts, reviews.routes.ts
 */

import { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../utils/async-handler";
import { sendError, sendSuccess } from "../../utils/api-response";
import * as reviewsService from "./reviews.service";

export const UpdateReviewSettingsSchema = z.object({
  // null / "" = link hatao
  googleReviewUrl: z.string().trim().max(500, "Link is too long").nullable(),
});

export const getSummary = asyncHandler(async (req: Request, res: Response) => {
  const days = req.query.days === undefined ? 30 : Number(req.query.days);
  if (![7, 30, 90].includes(days)) return sendError(res, "days must be 7, 30 or 90", 400);
  return sendSuccess(res, await reviewsService.getReviewSummary(req.user!.outletId, days));
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const { googleReviewUrl } = req.body as z.infer<typeof UpdateReviewSettingsSchema>;
  const result = await reviewsService.updateReviewSettings(
    req.user!.outletId,
    req.user!.userId,
    googleReviewUrl ? googleReviewUrl : null
  );
  return sendSuccess(res, result, googleReviewUrl ? "Review link saved" : "Review link removed");
});

export const listFeedback = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reviewsService.listFeedback(req.user!.outletId));
});

export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reviewsService.markAllFeedbackRead(req.user!.outletId));
});
