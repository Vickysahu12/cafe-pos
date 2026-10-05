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
import { publicOrderRateLimiter } from "../../middleware/rate-limiter";

const router = Router();

// Koi authenticate() nahi — yeh sab routes intentionally public hain

// ADDED (2026-10-05): digital bill — "/bills/:orderId" slug wale routes se PEHLE, taaki
// "bills" kabhi kisi cafe ka slug na samjha jaaye
router.get("/bills/:orderId", publicMenuController.getBill);
router.get("/:slug/menu", publicMenuController.getMenu);
// FIX (2026-09-29): publicOrderRateLimiter — fake-order spam se KDS bachane ke liye
router.post(
  "/:slug/orders",
  publicOrderRateLimiter,
  validate(CreateOrderSchema.omit({ outletId: true })), // ← .omit() add kiya
  publicMenuController.createOrder
);
router.get("/:slug/orders/:orderId", publicMenuController.getOrderStatus);

export default router;