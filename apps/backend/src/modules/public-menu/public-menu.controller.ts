/**
 * PUBLIC MENU CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — no `req.user` yahan kabhi nahi milega
 * (koi authenticate middleware nahi lagta is module ke routes pe).
 *
 * CONNECTED TO:
 * - public-menu.service.ts → business logic
 * - public-menu.routes.ts    → handlers yahan se attach hote hain
 * - sockets/index.ts         → getIO() se KDS/POS ko naya order batata hai
 */

import { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as publicMenuService from "./public-menu.service";
import { getIO } from "../../sockets";
import * as reviewsService from "../reviews/reviews.service";
import { withoutCustomerPhone } from "../orders/customer-privacy";

export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  // FIX (2026-09-30): `?table=<tableId>` — per-table QR se aaya customer
  const table = typeof req.query.table === "string" ? req.query.table : undefined;
  const menu = await publicMenuService.getPublicMenu(req.params.slug as string, table);
  return sendSuccess(res, menu);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await publicMenuService.createPublicOrder(req.params.slug as string, req.body);

  // FIX (2026-09-29): LAUNCH BLOCKER. Pehle customer ka QR order DB mein ban
  // jaata tha lekin koi socket event nahi jaata tha — Chef ke KDS pe order tab
  // tak dikhta hi nahi tha jab tak koi screen refresh na kare. Ab cashier wale
  // order jaisa hi `order:created` KDS + POS dono rooms ko jaata hai
  // (room names orders.controller.ts ke rooms() jaise hi hain).
  const outletId = order.outletId;
  // FIX (2026-10-06): customer ka PHONE kitchen ko nahi (orders/customer-privacy.ts). Owner/Manager
  // dono rooms mein hote hain → KDS emit `.except(pos)` taaki unhe event do baar na mile.
  const kds = `outlet_${outletId}_kds`;
  const pos = `outlet_${outletId}_pos`;
  getIO().to(kds).except(pos).emit("order:created", { order: withoutCustomerPhone(order), outletId });
  getIO().to(pos).emit("order:created", { order, outletId });

  // Customer ko sirf utna hi data wapas bhejte hain jitna uske kaam ka hai —
  // internal ids (outletId, cashierId, table) public response mein nahi jaate
  return sendSuccess(
    res,
    {
      id: order.id,
      orderNumber: order.orderNumber,
      netAmount: order.netAmount,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
    },
    "Order placed",
    201
  );
});

export const getOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await publicMenuService.getPublicOrderStatus(
    req.params.slug as string,
    req.params.orderId as string
  );
  return sendSuccess(res, order);
});

// ADDED (2026-10-05): digital bill (WhatsApp pe bheja gaya link) — dekho service getPublicBill
// Agar kabhi kisi cafe ka slug hi "bills" ho ("Bills Cafe"), to /bills/menu jaisi request
// yahan na atke: UUID nahi hai → next() → neeche ke /:slug/... routes sambhaal lete hain.
const BILL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const getBill = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (!BILL_ID_RE.test(req.params.orderId as string)) return next();
  const bill = await publicMenuService.getPublicBill(req.params.orderId as string);
  return sendSuccess(res, bill);
});

// ─── ADDED (2026-10-05): REVIEW BOOSTER (public) — logic reviews.service.ts mein ───

export const getReviewInfo = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await reviewsService.getPublicReviewInfo(req.params.slug as string));
});

export const submitFeedback = asyncHandler(async (req: Request, res: Response) => {
  await reviewsService.submitFeedback(req.params.slug as string, req.body);
  return sendSuccess(res, null, "Thank you! The owner will see your message.", 201);
});

export const recordReviewEvent = asyncHandler(async (req: Request, res: Response) => {
  await reviewsService.recordReviewEvent(req.params.slug as string, req.body.type);
  return sendSuccess(res, null, "ok");
});
