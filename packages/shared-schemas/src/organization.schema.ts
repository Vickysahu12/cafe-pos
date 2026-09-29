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
});
export type UpdateOutletInput = z.infer<typeof UpdateOutletSchema>;