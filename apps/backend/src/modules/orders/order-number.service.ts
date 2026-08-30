/**
 * ORDER NUMBER SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Har outlet ke liye daily-reset order number generate
 * karta hai (order #1, #2, #3... jo roz raat 12 baje wapas #1 se
 * shuru ho). Postgres mein native per-day-resetting sequence nahi
 * hoti, isliye OrderCounter table use kar rahe hain — ek row per
 * outlet per day, jisko hum transaction ke andar atomically
 * increment karte hain.
 *
 * CRITICAL — RACE CONDITION HANDLING:
 * Agar 2 Cashiers EK HI SECOND mein order place karein, dono
 * simultaneously counter padh ke "5" dekh sakte hain aur dono
 * ko order #6 mil sakta hai (DUPLICATE — bug). Isko rokne ke liye
 * hum Prisma ka `upsert` + row-level atomic increment use kar rahe
 * hain (`{ increment: 1 }`), jo Postgres ke level pe hi atomic hai —
 * database khud guarantee karta hai ki do simultaneous increments
 * kabhi ek dusre ko overwrite nahi karenge, chahe kitni bhi requests
 * ek saath aayein.
 *
 * CONNECTED TO:
 * - config/db.ts        → Prisma client
 * - orders.service.ts    → order create karte waqt isko call karta hai
 * - prisma/schema.prisma → OrderCounter model
 */

import { prisma } from "../../config/db";
import type { Prisma } from "@prisma/client";

/**
 * USE CASE: Aaj ke din ka next order number deta hai, us outlet ke liye.
 * MUST be called inside a transaction (tx) that also creates the Order,
 * so that if order creation fails after this, the counter increment
 * rolls back too (atomicity — no "gaps" in the sequence from failed orders).
 *
 * @param tx - Prisma transaction client (passed from orders.service.ts,
 *             NOT the global `prisma` — this ensures both the counter
 *             increment AND the order creation succeed or fail together)
 * @param outletId - jis outlet ke liye number chahiye
 */
export async function getNextOrderNumber(
  tx: Prisma.TransactionClient,
  outletId: string
): Promise<number> {
  // Today's date, stripped to just the date part (no time) —
  // matches the OrderCounter.date column's @db.Date type
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // upsert = "update if exists, else create" — atomic at the DB level.
  // If today's counter row for this outlet doesn't exist yet (first
  // order of the day), it's created starting at 1. If it exists,
  // Postgres atomically increments `lastNumber` — this is safe even
  // if 100 requests hit this at the exact same millisecond.
  const counter = await tx.orderCounter.upsert({
    where: {
      outletId_date: { outletId, date: today }, // matches @@unique([outletId, date])
    },
    update: {
      lastNumber: { increment: 1 },
    },
    create: {
      outletId,
      date: today,
      lastNumber: 1,
    },
  });

  return counter.lastNumber;
}