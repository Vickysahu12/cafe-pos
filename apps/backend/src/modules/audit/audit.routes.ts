/**
 * AUDIT ROUTES
 * ─────────────────────────────────────────────────────────
 * USE CASE: Audit log URL path + RBAC. Sirf OWNER dekh sakta hai —
 * PRD RBAC matrix mein "Audit Logs & Void Order Reports" sirf
 * Owner column mein ✅ hai, Manager ke liye bhi ❌.
 *
 * CONNECTED TO:
 * - audit.controller.ts → handler
 * - middleware/authenticate.ts, authorize.ts
 * - src/app.ts            → `/api/v1/audit` pe mount hoga
 */

import { Router } from "express";
import * as auditController from "./audit.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";

const router = Router();

router.use(authenticate);
router.get("/logs", authorize("OWNER"), auditController.getAuditLogs);

export default router;