/**
 * TABLES CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — tables.service.ts ko call karta hai.
 *
 * CONNECTED TO:
 * - tables.service.ts → business logic
 * - tables.routes.ts   → handlers yahan se attach hote hain
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as tablesService from "./tables.service";

export const createTable = asyncHandler(async (req: Request, res: Response) => {
  const table = await tablesService.createTable(req.body, req.user!.outletId);
  return sendSuccess(res, table, "Table created", 201);
});

export const getTables = asyncHandler(async (req: Request, res: Response) => {
  const tables = await tablesService.getTables(req.user!.outletId);
  return sendSuccess(res, tables);
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const table = await tablesService.updateTableStatus(
    req.params.id as string,
    req.user!.outletId,
    req.body.status
  );
  return sendSuccess(res, table, "Table status updated");
});