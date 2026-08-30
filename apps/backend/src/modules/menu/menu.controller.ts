/**
 * MENU CONTROLLER
 * ─────────────────────────────────────────────────────────
 * USE CASE: HTTP layer — request se data nikalta hai (req.body,
 * req.query, req.user), menu.service.ts ko call karta hai, aur
 * response wapas bhejta hai standard {success,message,data,error}
 * format mein. Yahan koi database logic nahi likhna — woh service
 * mein hi rehna chahiye (separation of concerns).
 *
 * CONNECTED TO:
 * - menu.service.ts     → asli logic yahan se aata hai
 * - menu.routes.ts       → yeh functions un routes se attach hote hain
 * - utils/async-handler.ts → try/catch wrapper, error middleware tak bhejta hai
 * - utils/api-response.ts  → sendSuccess() ka standard format
 */

import { Request, Response } from "express";
import { asyncHandler } from "../../utils/async-handler";
import { sendSuccess } from "../../utils/api-response";
import * as menuService from "./menu.service";

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  // req.user yahan se aata hai: middleware/authenticate.ts ne JWT verify
  // karke isko attach kiya tha route pe pahunchne se pehle
  const category = await menuService.createCategory(req.body, req.user!.outletId);
  return sendSuccess(res, category, "Category created", 201);
});

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await menuService.getCategories(req.user!.outletId);
  return sendSuccess(res, categories);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = await menuService.updateCategory(req.params.id as string, req.user!.outletId, req.body);
  return sendSuccess(res, category, "Category updated");
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await menuService.createProduct(req.body, req.user!.outletId);
  return sendSuccess(res, product, "Product created", 201);
});

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  // Query params hamesha string hote hain HTTP mein — isAvailable ko
  // boolean mein convert karna zaroori hai, warna "false" bhi truthy string ban jayega
  const { categoryId, search, isAvailable } = req.query;
  const products = await menuService.getProducts(req.user!.outletId, {
    categoryId: categoryId as string | undefined,
    search: search as string | undefined,
    isAvailable: isAvailable !== undefined ? isAvailable === "true" : undefined,
  });
  return sendSuccess(res, products);
});
export const toggleAvailability = asyncHandler(async (req: Request, res: Response) => {
  const product = await menuService.toggleProductAvailability(
    req.params.id as string,   // ← yahan 'as string' add kiya
    req.user!.outletId,
    req.body.isAvailable
  );
  return sendSuccess(res, product, "Availability updated");
});