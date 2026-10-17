/**
 * ORGANIZATION ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Organization/Outlet URL paths + RBAC. Update sirf
 * OWNER kar sakta hai (business-critical info, Manager ko access nahi).
 *
 * CONNECTED TO:
 * - organization.controller.ts → handlers
 * - middleware/authenticate.ts, authorize.ts, validate.ts
 * - packages/shared-schemas      → UpdateOutletSchema
 * - src/app.ts                    → `/api/v1/organization` pe mount hoga
 */

import { Router } from "express";
import * as organizationController from "./organization.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { UpdateOutletSchema, SetWorkModeSchema, SetOnlineOrdersSchema, SetUpiSchema } from "@cafe-pos/shared-schemas";

const router = Router();

router.use(authenticate);

router.get("/outlet", organizationController.getOutlet); // sab roles dekh sakte hain
router.patch(
  "/outlet",
  authorize("OWNER"), // sirf Owner update kar sakta hai
  validate(UpdateOutletSchema),
  organizationController.updateOutlet
);
// ADDED (2026-10-17): Solo/Team sirf Owner; online orders pause — counter pe jo bhi ho (Chef nahi)
router.patch("/outlet/work-mode", authorize("OWNER"), validate(SetWorkModeSchema), organizationController.setWorkMode);
router.patch(
  "/outlet/online-orders",
  authorize("OWNER", "MANAGER", "CASHIER"),
  validate(SetOnlineOrdersSchema),
  organizationController.setOnlineOrders
);

// ADDED (2026-10-18): UPI ID sirf Owner badal sakta hai (staff apna UPI daal ke paisa na le jaaye)
router.patch("/outlet/upi", authorize("OWNER"), validate(SetUpiSchema), organizationController.setUpi);
router.post("/outlet/upi/verify", authorize("OWNER"), organizationController.verifyUpi);

router.get("/outlets", organizationController.getOrganizationOutlets); // sab roles

export default router;