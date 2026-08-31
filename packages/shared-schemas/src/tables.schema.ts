/**
 * TABLES SCHEMAS
 * ─────────────────────────────────────────────────────────
 * USE CASE: Validation — table create aur status-update requests ke liye.
 *
 * CONNECTED TO:
 * - tables.routes.ts (backend) → validate() middleware
 * - index.ts (isi package ka)   → re-export
 */

import { z } from "zod";

export const CreateTableSchema = z.object({
  tableNumber: z.string().min(1, "Table number is required"),
  capacity: z.number().int().positive("Capacity must be at least 1"),
});
export type CreateTableInput = z.infer<typeof CreateTableSchema>;

export const UpdateTableStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED"]),
});
export type UpdateTableStatusInput = z.infer<typeof UpdateTableStatusSchema>;