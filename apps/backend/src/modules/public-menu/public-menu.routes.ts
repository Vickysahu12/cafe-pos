/**
 * PUBLIC MENU ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Customer QR ordering URL paths. CRITICAL: koi bhi
 * `authenticate` middleware NAHI lagta yahan — yeh jaan-bujh ke
 * hai, customer ke paas login hi nahi hota. Security is trust
 * boundary se aati hai ki service layer hamesha slug-se-outlet
 * resolve karta hai, kabhi outletId directly accept nahi karta.
 *
 * RATE LIMITING NOTE: Yeh routes public hain (koi bhi hit kar
 * sakta hai bina auth ke), isliye general rateLimiter (app.ts mein
 * already lagा hai globally) yahan aur zaroori ho jaata hai — abuse
 * se bachne ke liye.
 *
 * CONNECTED TO:
 * - public-menu.controller.ts → handlers
 * - middleware/validate.ts     → Zod validation (authenticate/authorize NAHI)
 * - packages/shared-schemas     → CreateOrderSchema (reuse Orders module ka)
 * - src/app.ts                  → `/api/v1/public` pe mount hoga
 */

import { Router } from "express";
import * as publicMenuController from "./public-menu.controller";
import { validate } from "../../middleware/validate";
import { CreateOrderSchema } from "@cafe-pos/shared-schemas";

const router = Router();

// Koi authenticate() nahi — yeh sab routes intentionally public hain
router.get("/:slug/menu", publicMenuController.getMenu);
router.post(
  "/:slug/orders",
  validate(CreateOrderSchema.omit({ outletId: true })), // ← .omit() add kiya
  publicMenuController.createOrder
);
router.get("/:slug/orders/:orderId", publicMenuController.getOrderStatus);

export default router;