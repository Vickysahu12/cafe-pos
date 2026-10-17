/**
 * DELIVERY CONTROLLER — WhatsApp delivery link
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-18)
 * Staff (cafe phone) + public rider link dono ke handlers. Order badla → POS + KDS ko
 * `order:updated` (orders.controller jaisa hi: KDS ko bina customer phone/address).
 * CONNECTED TO: delivery.service.ts, delivery.routes.ts, rider.routes.ts
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import { getIO } from "../../sockets";
import { withoutCustomerPhone } from "../orders/customer-privacy";
import * as deliveryService from "./delivery.service";

function emitOrderUpdated(outletId: string, order: any) {
  try {
    const kds = `outlet_${outletId}_kds`;
    const pos = `outlet_${outletId}_pos`;
    getIO().to(kds).except(pos).emit("order:updated", { order: withoutCustomerPhone(order), outletId });
    getIO().to(pos).emit("order:updated", { order, outletId });
  } catch {
    // socket server nahi (tests) — app focus pe refetch karta hai
  }
}

// ── Staff ──
export const listPeople = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await deliveryService.listDeliveryPeople(req.user!.outletId));
});

export const addPerson = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await deliveryService.addDeliveryPerson(req.user!.outletId, req.body), "Saved", 201);
});

export const removePerson = asyncHandler(async (req: Request, res: Response) => {
  await deliveryService.removeDeliveryPerson(req.user!.outletId, req.params.id as string);
  return sendSuccess(res, null, "Removed");
});

export const dispatch = asyncHandler(async (req: Request, res: Response) => {
  const outletId = req.user!.outletId;
  const { order, token, personPhone } = await deliveryService.dispatchOrder(
    req.params.id as string,
    outletId,
    req.user!.userId,
    req.body
  );
  emitOrderUpdated(outletId, order);
  // Raw token sirf isi response mein (app WhatsApp message mein link banata hai) — DB mein sirf hash
  return sendSuccess(res, { order, token, personPhone }, token ? "Link created" : "Out for delivery");
});

export const getCash = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await deliveryService.getDeliveryCash(req.user!.outletId));
});

export const settleCash = asyncHandler(async (req: Request, res: Response) => {
  const result = await deliveryService.settleDeliveryCash(req.user!.outletId, req.user!.userId, req.body);
  return sendSuccess(res, result, "Cash received");
});

// ── Rider (public link) ──
export const riderView = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await deliveryService.getRiderView(req.params.token as string));
});

export const riderDelivered = asyncHandler(async (req: Request, res: Response) => {
  const { view, order, outletId } = await deliveryService.riderMarkDelivered(req.params.token as string, req.body);
  if (order) emitOrderUpdated(outletId, order);
  return sendSuccess(res, view, "Delivered");
});

export const riderIssue = asyncHandler(async (req: Request, res: Response) => {
  const { view, order, outletId } = await deliveryService.riderReportIssue(req.params.token as string);
  emitOrderUpdated(outletId, order);
  return sendSuccess(res, view, "The café has been told");
});
