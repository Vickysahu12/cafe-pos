/**
 * ANALYTICS ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Analytics URL paths + RBAC. Sirf OWNER — PRD RBAC
 * matrix mein "Full Sales & Revenue Analytics" sirf Owner column
 * mein ✅ hai, Manager ke liye bhi ❌.
 *
 * CONNECTED TO:
 * - analytics.controller.ts → handlers
 * - middleware/authenticate.ts, authorize.ts
 * - src/app.ts                → `/api/v1/analytics` pe mount hoga
 */

import { Router } from "express";
import * as analyticsController from "./analytics.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);
router.use(authorize("OWNER"));

router.get("/daily-summary", analyticsController.getDailySummary);
router.get("/hourly-sales", analyticsController.getHourlySales);

export default router;