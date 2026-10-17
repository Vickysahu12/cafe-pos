/**
 * DELIVERY ROUTES (staff) — `/api/v1/delivery`
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-18): WhatsApp delivery link
 *  - Delivery people list/add + dispatch: Owner, Manager, Cashier (counter pe jo bhi ho). Chef nahi.
 *  - Remove person + delivery cash (paisa): sirf Owner/Manager.
 * outletId hamesha JWT se (service har query mein outletId lagata hai).
 * CONNECTED TO: delivery.controller.ts, app.ts
 */

import { Router } from "express";
import * as c from "./delivery.controller";
import { authenticate } from "../../middleware/authenticate";
import { authorize } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { DeliveryPersonSchema, DispatchOrderSchema, SettleDeliveryCashSchema } from "@cafe-pos/shared-schemas";

const router = Router();
router.use(authenticate);

const COUNTER = ["OWNER", "MANAGER", "CASHIER"] as const;

router.get("/people", authorize(...COUNTER), c.listPeople);
router.post("/people", authorize(...COUNTER), validate(DeliveryPersonSchema), c.addPerson);
router.delete("/people/:id", authorize("OWNER", "MANAGER"), c.removePerson);

router.post("/orders/:id/dispatch", authorize(...COUNTER), validate(DispatchOrderSchema), c.dispatch);

router.get("/cash", authorize("OWNER", "MANAGER"), c.getCash);
router.post("/cash/settle", authorize("OWNER", "MANAGER"), validate(SettleDeliveryCashSchema), c.settleCash);

export default router;
