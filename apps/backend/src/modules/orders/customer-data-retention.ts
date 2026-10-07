/**
 * CUSTOMER DATA RETENTION — phone numbers 30 din baad delete
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-06)
 *
 * USE CASE: Customer ne phone sirf "is order ke baare mein contact" ke liye diya tha.
 * Order khatam hone ke kaafi baad bhi number rakhna = bina wajah personal data
 * (India DPDP Act: purpose poora hone pe data hatao). Isliye 30 din purane orders se
 * `customerPhone` NULL kar dete hain. Order, bill, naam, reports sab waise hi rehte hain.
 *
 * Kab chalta hai: server start pe + har 6 ghante. Idempotent hai — 2 servers ek saath
 * chalayein to bhi koi nuksaan nahi (dono same rows null karenge). Ek query, index
 * orders(outletId, createdAt) ki zaroorat nahi kyunki sirf phone wale purane rows touch hote hain.
 *
 * CONNECTED TO: server.ts (startCustomerDataRetention), privacy policy ("30 days")
 */

import { prisma } from "../../config/db";
import { logger } from "../../config/logger";

export const CUSTOMER_PHONE_RETENTION_DAYS = 30;
const EVERY_6_HOURS = 6 * 60 * 60 * 1000;

export async function purgeOldCustomerPhones(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CUSTOMER_PHONE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const { count } = await prisma.order.updateMany({
    where: { customerPhone: { not: null }, createdAt: { lt: cutoff } },
    data: { customerPhone: null },
  });
  if (count > 0) logger.info(`Retention: removed customer phone from ${count} order(s) older than ${CUSTOMER_PHONE_RETENTION_DAYS} days`);
  return count;
}

export function startCustomerDataRetention() {
  const run = () => purgeOldCustomerPhones().catch((err) => logger.error("Retention job failed", err));
  run();
  // unref: yeh timer akela server ko zinda na rakhe (tests/shutdown clean)
  setInterval(run, EVERY_6_HOURS).unref();
}
