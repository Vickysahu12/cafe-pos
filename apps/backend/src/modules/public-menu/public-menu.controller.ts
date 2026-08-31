/**
 * PUBLIC MENU CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — no `req.user` yahan kabhi nahi milega
 * (koi authenticate middleware nahi lagta is module ke routes pe).
 *
 * CONNECTED TO:
 * - public-menu.service.ts → business logic
 * - public-menu.routes.ts    → handlers yahan se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as publicMenuService from "./public-menu.service";

export const getMenu = asyncHandler(async (req: Request, res: Response) => {
  const menu = await publicMenuService.getPublicMenu(req.params.slug as string);
  return sendSuccess(res, menu);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const order = await publicMenuService.createPublicOrder(req.params.slug as string, req.body);
  return sendSuccess(res, order, "Order placed", 201);
});

export const getOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const order = await publicMenuService.getPublicOrderStatus(
    req.params.slug as string,
    req.params.orderId as string
  );
  return sendSuccess(res, order);
});