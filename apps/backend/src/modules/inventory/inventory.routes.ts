/**
 * INVENTORY ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Inventory URL paths + RBAC. PRD ke hisaab se sirf
 * OWNER/MANAGER inventory manage kar sakte hain — Cashier/Chef
 * ko iska access nahi (RBAC matrix se confirm).
 *
 * CONNECTED TO:
 * - inventory.controller.ts → handlers
 * - middleware/authenticate.ts, authorize.ts, validate.ts
 * - packages/shared-schemas   → inventory schemas
 * - src/app.ts                 → `/api/v1/inventory` pe mount hoga
 */

import { Router } from "express";
import * as inventoryController from "./inventory.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  CreateInventoryItemSchema,
  UpdateQuantitySchema,
  UpdateThresholdSchema,
} from "@cafe-pos/shared-schemas";

const router = Router();

router.use(authenticate);
router.use(authorize("OWNER", "MANAGER")); // poora module hi Owner/Manager ke liye hai

router.post("/", validate(CreateInventoryItemSchema), inventoryController.createItem);
router.get("/", inventoryController.getItems);
router.get("/low-stock", inventoryController.getLowStock);
router.patch(
  "/:id/quantity",
  validate(UpdateQuantitySchema),
  inventoryController.updateQuantity
);
router.patch(
  "/:id/threshold",
  validate(UpdateThresholdSchema),
  inventoryController.updateThreshold
);

export default router;