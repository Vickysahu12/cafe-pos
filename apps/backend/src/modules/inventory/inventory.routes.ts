/**
 * INVENTORY ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Inventory URL paths + RBAC. PRD ke hisaab se sirf
 * OWNER/MANAGER inventory manage kar sakte hain — Cashier/Chef
 * ko iska access nahi (RBAC matrix se confirm).
 *
 * UPDATED (2026-10-09) — STOCK SOP routes. Order zaroori hai: fixed paths (/counts,
 * /recipes, /availability, /low-stock) `/:id` se PEHLE, warna "counts" ko item id samjha jaata.
 * Exception: /availability Cashier bhi (billing pe "Out of stock" badge) — sirf product ids,
 * koi quantity/cost nahi.
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
  UpdateInventoryItemSchema,
  StockPurchaseSchema,
  StockWastageSchema,
  StockCountSchema,
  SaveRecipeSchema,
  UpdateQuantitySchema,
  UpdateThresholdSchema,
} from "@cafe-pos/shared-schemas";

const router = Router();

router.use(authenticate);

// ADDED (2026-10-09): billing badges — Cashier ko bhi (neeche wale authorize se PEHLE)
router.get("/availability", authorize("OWNER", "MANAGER", "CASHIER"), inventoryController.getAvailability);

router.use(authorize("OWNER", "MANAGER")); // baaki poora module Owner/Manager ke liye hai

router.post("/", validate(CreateInventoryItemSchema), inventoryController.createItem);
router.get("/", inventoryController.getItems);
router.get("/low-stock", inventoryController.getLowStock);

// ADDED (2026-10-09): stock count (variance)
router.post("/counts", validate(StockCountSchema), inventoryController.createCount);
router.get("/counts", inventoryController.getCounts);
router.get("/counts/:countId", inventoryController.getCount);

// ADDED (2026-10-09): recipes (menu item → ingredients)
router.get("/recipes", inventoryController.getRecipeSummary);
router.get("/recipes/:productId", inventoryController.getRecipe);
router.put("/recipes/:productId", validate(SaveRecipeSchema), inventoryController.saveRecipe);

// ADDED (2026-10-09): ek item
router.get("/:id", inventoryController.getItem);
router.patch("/:id", validate(UpdateInventoryItemSchema), inventoryController.updateItem);
router.delete("/:id", inventoryController.archiveItem);
router.post("/:id/purchase", validate(StockPurchaseSchema), inventoryController.purchase);
router.post("/:id/wastage", validate(StockWastageSchema), inventoryController.wastage);

// Purane app ke endpoints (ab ledger ke through)
router.patch("/:id/quantity", validate(UpdateQuantitySchema), inventoryController.updateQuantity);
router.patch("/:id/threshold", validate(UpdateThresholdSchema), inventoryController.updateThreshold);

export default router;
