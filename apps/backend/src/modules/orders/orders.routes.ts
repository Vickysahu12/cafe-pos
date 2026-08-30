/**
 * ORDERS ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Order-related URL paths + RBAC. Void ko sirf
 * OWNER/MANAGER kar sakte hain (PRD ka "Requires Owner/Manager
 * PIN/Role" requirement — PIN abhi MVP se bahar hai, role-check
 * abhi ke liye kaafi hai).
 *
 * CONNECTED TO:
 * - orders.controller.ts → handlers
 * - middleware/authenticate.ts, authorize.ts, validate.ts
 * - packages/shared-schemas → CreateOrderSchema, etc.
 * - src/app.ts → yahan `/api/v1/orders` pe mount hoga
 */

import { Router } from "express";
import * as ordersController from "./orders.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  PayOrderSchema,
  VoidOrderSchema,
} from "@cafe-pos/shared-schemas";

const router = Router();

router.use(authenticate);

// Order create — Cashier + Owner/Manager (Chef order nahi banata)
router.post(
  "/",
  authorize("OWNER", "MANAGER", "CASHIER"),
  validate(CreateOrderSchema.omit({ outletId: true })),  // ← .omit() add kiya
  ordersController.createOrder
);

router.get("/", ordersController.getOrders);
router.get("/:id", ordersController.getOrderById);

// Poore order ka status — Cashier/Chef/Owner/Manager (waiter-step ke liye sab allowed)
router.patch(
  "/:id/status",
  authorize("OWNER", "MANAGER", "CASHIER", "CHEF"),
  validate(UpdateOrderStatusSchema),
  ordersController.updateOrderStatus
);

// Single item ka status — yeh Chef ka KDS action hai
router.patch(
  "/:id/items/:itemId/status",
  authorize("OWNER", "MANAGER", "CHEF"),
  ordersController.updateOrderItemStatus
);

router.post(
  "/:id/pay",
  authorize("OWNER", "MANAGER", "CASHIER"),
  validate(PayOrderSchema),
  ordersController.payOrder
);

// Void — sirf Owner/Manager, zero-theft audit ke liye
router.post(
  "/:id/void",
  authorize("OWNER", "MANAGER"),
  validate(VoidOrderSchema),
  ordersController.voidOrder
);

export default router;