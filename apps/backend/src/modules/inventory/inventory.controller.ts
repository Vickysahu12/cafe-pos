/**
 * INVENTORY CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — inventory.service.ts ko call karta hai,
 * standard response format mein wapas bhejta hai.
 *
 * UPDATED (2026-10-09) — STOCK SOP: item detail + history, edit, purchase, wastage, stock
 * count (variance), archive, recipes, billing availability. Har stock badlav ke baad
 * `inventory:changed` socket (stock-events.ts) → doosre phones ki Stock screen live update.
 * outletId / userId HAMESHA token se — doosre cafe ka stock chhoona impossible.
 *
 * CONNECTED TO:
 * - inventory.service.ts, recipes.service.ts → business logic
 * - inventory.routes.ts   → handlers yahan se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess, sendError } from "../../utils/api-response";
import * as inventoryService from "./inventory.service";
import * as recipesService from "./recipes.service";
import { emitStockChange } from "./stock-events";

const changed = (req: Request) => emitStockChange(req.user!.outletId, { changed: true, alerts: [] });

export const createItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.createInventoryItem(req.body, req.user!.outletId, req.user!.userId);
  changed(req);
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

// ── ADDED (2026-10-09) ──────────────────────────────────

export const getItem = asyncHandler(async (req: Request, res: Response) => {
  let before: Date | undefined;
  if (req.query.before !== undefined) {
    before = new Date(String(req.query.before));
    if (Number.isNaN(before.getTime())) return sendError(res, "Invalid 'before' cursor", 400);
  }
  const data = await inventoryService.getInventoryItem(req.params.id as string, req.user!.outletId, before);
  return sendSuccess(res, data);
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.updateInventoryItem(req.params.id as string, req.user!.outletId, req.body);
  changed(req);
  return sendSuccess(res, item, "Stock item updated");
});

export const archiveItem = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.archiveInventoryItem(req.params.id as string, req.user!.outletId);
  changed(req);
  return sendSuccess(res, data, "Stock item removed");
});

export const purchase = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.recordPurchase(req.params.id as string, req.user!.outletId, req.user!.userId, req.body);
  changed(req);
  return sendSuccess(res, item, "Purchase added");
});

export const wastage = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.recordWastage(req.params.id as string, req.user!.outletId, req.user!.userId, req.body);
  changed(req);
  return sendSuccess(res, item, "Wastage recorded");
});

export const createCount = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.recordStockCount(req.user!.outletId, req.user!.userId, req.body);
  changed(req);
  return sendSuccess(res, data, "Stock count saved", 201);
});

export const getCounts = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await inventoryService.getStockCounts(req.user!.outletId));
});

export const getCount = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await inventoryService.getStockCount(req.user!.outletId, req.params.countId as string));
});

export const getAvailability = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await inventoryService.getProductAvailability(req.user!.outletId));
});

export const getRecipeSummary = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await recipesService.getRecipeSummary(req.user!.outletId));
});

export const getRecipe = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, await recipesService.getRecipe(req.params.productId as string, req.user!.outletId));
});

export const saveRecipe = asyncHandler(async (req: Request, res: Response) => {
  const data = await recipesService.saveRecipe(req.params.productId as string, req.user!.outletId, req.user!.userId, req.body);
  changed(req); // billing availability badges badal sakte hain
  return sendSuccess(res, data, "Recipe saved");
});

// ── Purane app ke endpoints (ab ledger ke through) ──────

export const updateQuantity = asyncHandler(async (req: Request, res: Response) => {
  const item = await inventoryService.updateInventoryQuantity(
    req.params.id as string,
    req.user!.outletId,
    req.user!.userId,
    req.body
  );
  changed(req);
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
