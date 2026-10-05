/**
 * REVIEWS ROUTES: /api/v1/reviews (Owner + Manager only)
 * ADDED (2026-10-05). Cashier/Chef ko private feedback ya Google link setting nahi dikhni chahiye.
 * Customer-side (public) routes public-menu.routes.ts mein hain (slug-based, bina login).
 */

import { Router } from "express";
import * as reviewsController from "./reviews.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";

const router = Router();

router.use(authenticate);
router.use(authorize("OWNER", "MANAGER"));

router.get("/summary", reviewsController.getSummary);
router.put("/settings", validate(reviewsController.UpdateReviewSettingsSchema), reviewsController.updateSettings);
router.get("/feedback", reviewsController.listFeedback);
router.post("/feedback/read-all", reviewsController.markAllRead);

export default router;
