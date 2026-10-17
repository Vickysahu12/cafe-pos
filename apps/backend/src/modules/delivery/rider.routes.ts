/**
 * RIDER LINK ROUTES (PUBLIC) — `/api/v1/rider/:token`
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-18): delivery boy ka WhatsApp link (order.billraw.in/d/<token>) yahin baat karta hai.
 * Koi login nahi — security token se: 128-bit random, DB mein sirf hash, ek order, 12 ghante,
 * naya bheja to purana band. riderRateLimiter: koi link guess karne ki koshish na kare.
 * Alag mount (/rider) — public-menu ke `/:slug/...` routes se kabhi takraaye nahi.
 * CONNECTED TO: delivery.controller.ts, app.ts, apps/web/app/d/[token]/page.tsx
 */

import { Router } from "express";
import * as c from "./delivery.controller";
import { validate } from "../../middleware/validate";
import { riderRateLimiter } from "../../middleware/rate-limiter";
import { RiderDeliveredSchema, RiderIssueSchema } from "@cafe-pos/shared-schemas";

const router = Router();

router.use(riderRateLimiter);
router.get("/:token", c.riderView);
router.post("/:token/delivered", validate(RiderDeliveredSchema), c.riderDelivered);
router.post("/:token/issue", validate(RiderIssueSchema), c.riderIssue);

export default router;
