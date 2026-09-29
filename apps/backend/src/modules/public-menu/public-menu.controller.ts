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

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as publicMenuService from "./public-menu.service";
import { getIO } from "../../sockets";

export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  const menu = await publicMenuService.getPublicMenu(req.params.slug as string);
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
  getIO()
    .to([`outlet_${outletId}_kds`, `outlet_${outletId}_pos`])
    .emit("order:created", { order, outletId });

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
