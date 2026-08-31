/**
 * TABLES ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Table URL paths + RBAC. PRD ke hisaab se "Table
 * Allocation & Switch" Owner/Manager/Cashier teeno kar sakte hain
 * (Chef nahi) — yeh Menu se alag hai, jahan sirf Owner/Manager likh sakte the.
 *
 * CONNECTED TO:
 * - tables.controller.ts → handlers
 * - middleware/authenticate.ts, authorize.ts, validate.ts
 * - packages/shared-schemas → tables schemas
 * - src/app.ts → `/api/v1/tables` pe mount hoga
 */

import { Router } from "express";
import * as tablesController from "./tables.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { CreateTableSchema, UpdateTableStatusSchema } from "@cafe-pos/shared-schemas";

const router = Router();

router.use(authenticate);

// Table create — sirf Owner/Manager (setup-level action, cafe layout badalna)
router.post(
  "/",
  authorize("OWNER", "MANAGER"),
  validate(CreateTableSchema),
  tablesController.createTable
);

// List — sab staff dekh sakte hain (Cashier ko allocation ke liye chahiye)
router.get("/", tablesController.getTables);

// Status update — Owner/Manager/Cashier (PRD RBAC matrix ke hisaab se)
router.patch(
  "/:id/status",
  authorize("OWNER", "MANAGER", "CASHIER"),
  validate(UpdateTableStatusSchema),
  tablesController.updateStatus
);

export default router;