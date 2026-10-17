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
// ADDED (2026-10-17): SOLO / TEAM — Owner Dashboard/Settings se chunta hai
export const SetWorkModeSchema = z.object({
  workMode: z.enum(["SOLO", "TEAM"]),
});
export type SetWorkModeInput = z.infer<typeof SetWorkModeSchema>;

// ADDED (2026-10-17): ONLINE ORDERS (QR + website) pause/resume.
//   paused false → turant khula. paused true + minutes → itni der baad apne aap khulega.
//   paused true bina minutes → jab tak koi wapas na khole.
export const SetOnlineOrdersSchema = z.object({
  paused: z.boolean(),
  minutes: z.union([z.literal(30), z.literal(60), z.literal(120)]).optional(),
});
export type SetOnlineOrdersInput = z.infer<typeof SetOnlineOrdersSchema>;

// ADDED (2026-10-18): UPI QR — Owner apna UPI ID set/hatata hai. upiId null = UPI QR band.
// Format: naam@bank (e.g. sharmacafe@okaxis). Galat ID = paisa galat jagah, isliye strict regex +
// app ₹1 self-test ke bina QR nahi dikhata.
export const SetUpiSchema = z.object({
  upiId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9.\-_]{2,256}@[a-z][a-z0-9.\-]{1,64}$/, "Enter a valid UPI ID, like yourname@okaxis")
    .nullable(),
  upiName: z.string().trim().min(2, "Enter the name customers should see").max(50, "Keep it under 50 characters").optional(),
});
export type SetUpiInput = z.infer<typeof SetUpiSchema>;
