import { z } from "zod";

// Category — e.g. "Beverages", "Starters", "Desserts"
export const CreateCategorySchema = z.object({
  name: z.string().min(2, "Category name is too short"),
  outletId: z.string().uuid("Invalid outlet ID"),
  sortOrder: z.number().int().min(0).optional().default(0),
  isAvailable: z.boolean().optional().default(true),
});
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

// Variant — e.g. Small/Medium/Large for a product
export const ProductVariantSchema = z.object({
  name: z.string().min(1, "Variant name is required"),
  price: z.number().positive("Price must be positive"),
});
export type ProductVariantInput = z.infer<typeof ProductVariantSchema>;

// Addon — e.g. Extra Cheese, Caramel Syrup
export const ProductAddonSchema = z.object({
  name: z.string().min(1, "Addon name is required"),
  price: z.number().positive("Price must be positive"),
});
export type ProductAddonInput = z.infer<typeof ProductAddonSchema>;

// Create/update a product — with optional variants + addons in one payload
export const CreateProductSchema = z.object({
  name: z.string().min(2, "Product name is too short"),
  description: z.string().max(500).optional(),
  price: z.number().positive("Price must be positive"), // base price
  categoryId: z.string().uuid("Invalid category ID"),
  outletId: z.string().uuid("Invalid outlet ID"),
  isAvailable: z.boolean().optional().default(true),
  taxRate: z.number().min(0).max(100).optional().default(0), // percentage
  isVeg: z.boolean(),
  variants: z.array(ProductVariantSchema).optional(),
  addons: z.array(ProductAddonSchema).optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

// Quick toggle for out-of-stock items — Cashier/Manager can flip this fast
export const ToggleAvailabilitySchema = z.object({
  isAvailable: z.boolean(),
});
export type ToggleAvailabilityInput = z.infer<typeof ToggleAvailabilitySchema>;

// Design decisions:

// CreateProductSchema mein variants aur addons ko same payload ke andar optional array rakha hai — tumhare PRD mein product create karte waqt Small/Medium/Large aur Extra Cheese jaise options ek saath define hote hain, isliye ek hi request mein sab bhej sakte ho instead of teen alag API calls
// isVeg mandatory rakha hai (optional nahi) — Indian cafe context mein veg/non-veg tag har product pe zaroori hai, isko skip nahi hone denge
// taxRate percentage format mein (0-100) — GST jaisa tax product-level pe alag ho sakta hai (jaise packaged items vs prepared food)