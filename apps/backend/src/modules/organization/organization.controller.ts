/**
 * ORGANIZATION CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — organization.service.ts ko call karta hai.
 *
 * CONNECTED TO:
 * - organization.service.ts → business logic
 * - organization.routes.ts    → handlers yahan se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as organizationService from "./organization.service";
import { getIO } from "../../sockets";

export const getOutlet = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.getOutlet(req.user!.outletId);
  return sendSuccess(res, outlet);
});

export const updateOutlet = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.updateOutlet(req.user!.outletId, req.body);
  return sendSuccess(res, outlet, "Outlet updated");
});

// ADDED (2026-10-17): SOLO / TEAM (Owner)
export const setWorkMode = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.setWorkMode(req.user!.outletId, req.user!.userId, req.body.workMode);
  return sendSuccess(res, outlet, "Saved");
});

// ADDED (2026-10-17): online orders pause/resume — doosre phones (Owner + Cashier) turant update hon
export const setOnlineOrders = asyncHandler(async (req: Request, res: Response) => {
  const ordering = await organizationService.setOnlineOrders(req.user!.outletId, req.user!.userId, req.body);
  try {
    getIO().to(`outlet_${req.user!.outletId}_pos`).emit("outlet:ordering", { ordering });
  } catch {
    // socket server nahi (tests) — ignore, app focus pe refetch karta hai
  }
  return sendSuccess(res, ordering, ordering.open ? "Online orders are on" : "Online orders paused");
});

// ADDED (2026-10-18): UPI QR (Owner)
export const setUpi = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.setUpi(req.user!.outletId, req.user!.userId, req.body);
  return sendSuccess(res, outlet, outlet.upiId ? "UPI ID saved" : "UPI QR turned off");
});
export const verifyUpi = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.verifyUpi(req.user!.outletId, req.user!.userId);
  return sendSuccess(res, outlet, "UPI QR is on");
});

export const getOrganizationOutlets = asyncHandler(async (req: Request, res: Response) => {
  const outlets = await organizationService.getOrganizationOutlets(req.user!.organizationId);
  return sendSuccess(res, outlets);
});