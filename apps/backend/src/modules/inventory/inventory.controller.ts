/**
 * INVENTORY CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — inventory.service.ts ko call karta hai,
 * standard response format mein wapas bhejta hai.
 *
 * CONNECTED TO:
 * - inventory.service.ts → business logic
 * - inventory.routes.ts   → handlers yahan se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as inventoryService from "./inventory.service";

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.createInventoryItem(req.body, req.user!.outletId);
  return sendSuccess(res, item, "Inventory item created", 201);
});

export const getItems = asyncHandler(async (req: Request, res: Response) => {
  const items = await inventoryService.getInventoryItems(req.user!.outletId);
  return sendSuccess(res, items);
});

export const getLowStock = asyncHandler(async (req: Request, res: Response) => {
  const items = await inventoryService.getLowStockItems(req.user!.outletId);
  return sendSuccess(res, items);
});

export const updateQuantity = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.updateInventoryQuantity(
    req.params.id as string,
    req.user!.outletId,
    req.body
  );
  return sendSuccess(res, item, "Quantity updated");
});

export const updateThreshold = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.updateThreshold(
    req.params.id as string,
    req.user!.outletId,
    req.body.lowStockAlertAt
  );
  return sendSuccess(res, item, "Threshold updated");
});