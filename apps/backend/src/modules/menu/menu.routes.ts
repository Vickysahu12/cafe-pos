/**
 * MENU ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: URL paths define karta hai aur unpe middleware-chain
 * lagata hai (authenticate → authorize → validate → controller).
 * Yeh backend ka "entry point" hai menu-related requests ke liye.
 *
 * CONNECTED TO:
 * - menu.controller.ts        → actual handlers yahan se aate hain
 * - middleware/authenticate.ts → JWT check karta hai
 * - middleware/authorize.ts    → RBAC — Owner/Manager hi menu edit kar sakte hain
 *   (RBAC matrix se: Cashier/Chef ko "Menu Editing" ka access nahi — sirf dekh sakte hain)
 * - middleware/validate.ts     → Zod schema se request body validate karta hai
 * - packages/shared-schemas    → CreateCategorySchema, CreateProductSchema yahan se
 * - src/app.ts                 → yeh poora router wahan `/api/v1/menu` pe mount hoga
 */

import { Router } from "express";
import * as menuController from "./menu.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  CreateCategorySchema,
  UpdateCategorySchema,
  CreateProductSchema,
  UpdateProductSchema,
  ToggleAvailabilitySchema,
} from "@cafe-pos/shared-schemas";

const router = Router();

// Sab menu routes authenticated hone chahiye — koi bhi staff member
// (Owner/Manager/Cashier/Chef) login hona zaroori hai menu dekhne ke liye
router.use(authenticate);

// READ — sab roles dekh sakte hain (Cashier ko billing ke liye chahiye,
// Chef ko KDS mein product naam dikhane ke liye)
router.get("/categories", menuController.getCategories);
router.get("/products", menuController.getProducts);

// WRITE — sirf OWNER/MANAGER, RBAC matrix ke hisaab se
router.post(
  "/categories",
  authorize("OWNER", "MANAGER"),
  validate(CreateCategorySchema.omit({ outletId: true })),  // ← .omit() add kiya
  menuController.createCategory
);
// FIX (2026-09-29): validate(UpdateCategorySchema) add kiya — pehle yahan koi
// validation nahi thi, raw body Prisma tak jaati thi (mass assignment, dekho menu.schema.ts)
router.patch(
  "/categories/:id",
  authorize("OWNER", "MANAGER"),
  validate(UpdateCategorySchema),
  menuController.updateCategory
);
router.post(
  "/products",
  authorize("OWNER", "MANAGER"),
  validate(CreateProductSchema.omit({ outletId: true })),  // ← .omit() add kiya
  menuController.createProduct
);
// FIX (2026-09-29): edit/delete routes — sirf OWNER/MANAGER (RBAC matrix: Menu Editing)
router.patch(
  "/products/:id",
  authorize("OWNER", "MANAGER"),
  validate(UpdateProductSchema),
  menuController.updateProduct
);
router.delete("/products/:id", authorize("OWNER", "MANAGER"), menuController.deleteProduct);
router.delete("/categories/:id", authorize("OWNER", "MANAGER"), menuController.deleteCategory);

router.patch(
  "/products/:id/toggle-availability",
  authorize("OWNER", "MANAGER"),
  validate(ToggleAvailabilitySchema),
  menuController.toggleAvailability
);

export default router;