/**
 * INVENTORY SCHEMAS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Validation rules inventory-related requests ke liye —
 * backend routes aur (baad mein) mobile Manager screen dono use karenge.
 *
 * UPDATED (2026-10-09) — STOCK SOP: units fixed list (g | kg | ml | L | pcs), purchase /
 * wastage / stock-count actions, aur recipes. Saari quantities ke liye upar ki limit rakhi
 * hai (galti se 1e12 type karke ledger kharab na ho) aur decimals 3 tak (0.125 kg).
 *
 * CONNECTED TO:
 * - inventory.routes.ts, recipes.routes.ts (backend) → validate() middleware ke saath
 * - index.ts (isi package ka)     → re-export
 */

import { z } from "zod";

// ADDED (2026-10-09): sirf yeh 5 units — conversion inhi ke beech (backend utils/units.ts)
export const STOCK_UNITS = ["g", "kg", "ml", "L", "pcs"] as const;
const UNIT_ALIASES: Record<string, (typeof STOCK_UNITS)[number]> = {
  g: "g", gm: "g", gms: "g", gr: "g", gram: "g", grams: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  ml: "ml", mls: "ml", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  l: "L", lt: "L", ltr: "L", ltrs: "L", litre: "L", litres: "L", liter: "L", liters: "L",
  pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", packet: "pcs", packets: "pcs", nos: "pcs",
};
/** Purana app "litres" / "packets" bhejta tha — migration jaisa hi map (backward compatible) */
export const StockUnitSchema = z.preprocess(
  (v) => (typeof v === "string" ? UNIT_ALIASES[v.trim().toLowerCase()] ?? v : v),
  z.enum(STOCK_UNITS, { errorMap: () => ({ message: "Unit must be g, kg, ml, L or pcs" }) })
);
export type StockUnit = (typeof STOCK_UNITS)[number];

const MAX_QTY = 1_000_000; // 10 lakh kg/L/pcs — kisi cafe ka asli stock isse bahut kam
const MAX_COST = 1_000_000; // ₹ per unit
/** 3 decimal tak (0.125 kg) — float kachra ledger mein na jaaye */
const qty = (msg: string) =>
  z
    .number({ invalid_type_error: msg })
    .finite(msg)
    .max(MAX_QTY, "That quantity is too large")
    .transform((v) => Math.round(v * 1000) / 1000);
const money = z
  .number({ invalid_type_error: "Enter a valid cost" })
  .finite()
  .min(0, "Cost cannot be negative")
  .max(MAX_COST, "That cost is too large")
  .transform((v) => Math.round(v * 100) / 100);
const itemName = z.string().trim().min(2, "Item name is too short").max(60, "Item name is too long");
const note = z.string().trim().max(200, "Note is too long").optional();

export const CreateInventoryItemSchema = z.object({
  name: itemName,
  quantity: qty("Enter a valid quantity").pipe(z.number().min(0, "Quantity cannot be negative")),
  unit: StockUnitSchema,
  lowStockAlertAt: qty("Enter a valid alert level").pipe(z.number().min(0)).optional().default(0),
  costPerUnit: money.optional().default(0),
});
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

/** ADDED (2026-10-09): naam / alert level / cost badlo. Unit LOCKED (recipes + history usi unit mein). */
export const UpdateInventoryItemSchema = z
  .object({
    name: itemName.optional(),
    lowStockAlertAt: qty("Enter a valid alert level").pipe(z.number().min(0)).optional(),
    costPerUnit: money.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;

/** ADDED (2026-10-09): maal aaya. unitCost diya to cost ka weighted average update hota hai. */
export const StockPurchaseSchema = z.object({
  quantity: qty("Enter a valid quantity").pipe(z.number().positive("Quantity must be more than 0")),
  unitCost: money.optional(),
  note,
});
export type StockPurchaseInput = z.infer<typeof StockPurchaseSchema>;

/** ADDED (2026-10-09): gira / kharab hua — reason zaroori (owner ko pata chale kyun) */
export const StockWastageSchema = z.object({
  quantity: qty("Enter a valid quantity").pipe(z.number().positive("Quantity must be more than 0")),
  note: z.string().trim().min(2, "Please add a reason").max(200, "Note is too long"),
});
export type StockWastageInput = z.infer<typeof StockWastageSchema>;

/** ADDED (2026-10-09): stock count — ek ya kai items ki ASLI ginti. Variance yahin nikalta hai. */
export const StockCountSchema = z.object({
  items: z
    .array(
      z.object({
        inventoryItemId: z.string().uuid("Invalid item"),
        actualQuantity: qty("Enter a valid count").pipe(z.number().min(0, "Count cannot be negative")),
      })
    )
    .min(1, "Count at least one item")
    .max(500, "Too many items in one count")
    .refine((list) => new Set(list.map((i) => i.inventoryItemId)).size === list.length, "An item is listed twice"),
  note,
});
export type StockCountInput = z.infer<typeof StockCountSchema>;

/** ADDED (2026-10-09): ek menu item ki poori recipe (replace). variantName null = sab sizes. */
export const SaveRecipeSchema = z.object({
  lines: z
    .array(
      z.object({
        variantName: z.string().trim().min(1).max(60).nullable().optional().transform((v) => v ?? null),
        inventoryItemId: z.string().uuid("Invalid stock item"),
        quantity: qty("Enter a valid quantity").pipe(z.number().positive("Quantity must be more than 0")),
        unit: StockUnitSchema,
      })
    )
    .max(60, "Too many ingredients")
    .refine(
      (lines) => new Set(lines.map((l) => `${(l.variantName ?? "").toLowerCase()}|${l.inventoryItemId}`)).size === lines.length,
      "The same ingredient is added twice for one size"
    ),
});
export type SaveRecipeInput = z.infer<typeof SaveRecipeSchema>;

// ── Purane app (pehle wale APK) ke liye — abhi bhi chalte hain ──
export const UpdateQuantitySchema = z.object({
  mode: z.enum(["SET", "ADD"]),
  quantity: z.number().finite().max(MAX_QTY).min(-MAX_QTY), // ADD mode mein negative bhi ho sakta hai (wastage)
});
export type UpdateQuantityInput = z.infer<typeof UpdateQuantitySchema>;

export const UpdateThresholdSchema = z.object({
  lowStockAlertAt: z.number().finite().min(0).max(MAX_QTY),
});
export type UpdateThresholdInput = z.infer<typeof UpdateThresholdSchema>;
