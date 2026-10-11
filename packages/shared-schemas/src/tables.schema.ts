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

// UPDATED (2026-10-11): naam max 20 (card pe fit), seats 1–50 (galti se 400 na ho)
const tableName = z.string().trim().min(1, "Table name is required").max(20, "Keep the table name under 20 characters");
const seats = z.number().int("Seats must be a whole number").min(1, "At least 1 seat").max(50, "That's too many seats for one table");

export const CreateTableSchema = z.object({
  tableNumber: tableName,
  capacity: seats,
});
export type CreateTableInput = z.infer<typeof CreateTableSchema>;

/** ADDED (2026-10-11): TABLE EDIT — rename / seats (Owner & Manager) */
export const UpdateTableSchema = z
  .object({ tableNumber: tableName.optional(), capacity: seats.optional() })
  .strict()
  .refine((v) => v.tableNumber !== undefined || v.capacity !== undefined, "Nothing to update");
export type UpdateTableInput = z.infer<typeof UpdateTableSchema>;

export const UpdateTableStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "OCCUPIED", "RESERVED"]),
});
export type UpdateTableStatusInput = z.infer<typeof UpdateTableStatusSchema>;