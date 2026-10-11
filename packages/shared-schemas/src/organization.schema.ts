/**
 * ORGANIZATION SCHEMAS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Validation — outlet update requests ke liye.
 *
 * CONNECTED TO:
 * - organization.routes.ts (backend) → validate() middleware
 * - index.ts (isi package ka)          → re-export
 */

import { z } from "zod";

export const UpdateOutletSchema = z.object({
  name: z.string().trim().min(2).optional(),
  address: z.string().trim().min(5).optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Invalid Indian phone number").optional(),
  gstNumber: z.string().trim().optional(),
  // ADDED (2026-10-11): DELIVERY settings (Owner) — website pe delivery on/off, default charge, min order
  deliveryEnabled: z.boolean().optional(),
  deliveryCharge: z.number().finite().min(0, "Charge cannot be negative").max(2000, "That charge is too high").optional(),
  deliveryMinOrder: z.number().finite().min(0, "Minimum order cannot be negative").max(100000).optional(),
  deliveryArea: z.string().trim().max(80, "Keep it under 80 characters").nullable().optional(),
});
export type UpdateOutletInput = z.infer<typeof UpdateOutletSchema>;