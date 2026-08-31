/**
 * INVENTORY SCHEMAS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Validation rules inventory-related requests ke liye —
 * backend routes aur (baad mein) mobile Manager screen dono use karenge.
 *
 * CONNECTED TO:
 * - inventory.routes.ts (backend) → validate() middleware ke saath
 * - index.ts (isi package ka)     → re-export
 */

import { z } from "zod";

export const CreateInventoryItemSchema = z.object({
  name: z.string().min(2, "Item name is too short"),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  unit: z.string().min(1, "Unit is required"), // e.g. "kg", "litres", "packets"
  lowStockAlertAt: z.number().min(0).optional().default(0),
});
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

export const UpdateQuantitySchema = z.object({
  mode: z.enum(["SET", "ADD"]),
  quantity: z.number(), // ADD mode mein negative bhi ho sakta hai (wastage)
});
export type UpdateQuantityInput = z.infer<typeof UpdateQuantitySchema>;

export const UpdateThresholdSchema = z.object({
  lowStockAlertAt: z.number().min(0),
});
export type UpdateThresholdInput = z.infer<typeof UpdateThresholdSchema>;