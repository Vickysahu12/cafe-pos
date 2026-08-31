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

export const getOutlet = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.getOutlet(req.user!.outletId);
  return sendSuccess(res, outlet);
});

export const updateOutlet = asyncHandler(async (req: Request, res: Response) => {
  const outlet = await organizationService.updateOutlet(req.user!.outletId, req.body);
  return sendSuccess(res, outlet, "Outlet updated");
});

export const getOrganizationOutlets = asyncHandler(async (req: Request, res: Response) => {
  const outlets = await organizationService.getOrganizationOutlets(req.user!.organizationId);
  return sendSuccess(res, outlets);
});