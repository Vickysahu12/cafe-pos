/**
 * TABLES SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Cafe ke dine-in tables manage karta hai — create karna,
 * list karna, aur status change karna (jab customer baithe/uthe).
 * Orders module isse already link hai (Order.tableId), yeh module
 * banne se dine-in flow poora ho jaata hai.
 *
 * CONNECTED TO:
 * - config/db.ts          → Prisma client
 * - tables.controller.ts    → HTTP layer isko call karta hai
 * - prisma/schema.prisma    → Table model
 * - orders.service.ts       → Order.tableId isi Table.id ko reference karta hai
 */

import { prisma } from "../../config/db";

function notFound(message: string): never {
  const err: any = new Error(message);
  err.statusCode = 404;
  throw err;
}

/** USE CASE: Naya table banata hai (jaise "Table 5", capacity 4) */
export async function createTable(
  input: { tableNumber: string; capacity: number },
  outletId: string
) {
  return prisma.table.create({
    data: { tableNumber: input.tableNumber, capacity: input.capacity, outletId },
  });
}

/**
 * USE CASE: Outlet ke saare tables list karta hai — Cashier ka
 * "table allocation" screen isi se banega, status ke saath
 * (AVAILABLE/OCCUPIED/RESERVED) taaki UI mein color-coding ho sake.
 */
export async function getTables(outletId: string) {
  return prisma.table.findMany({
    where: { outletId },
    orderBy: { tableNumber: "asc" },
  });
}

/**
 * USE CASE: Table ka status badalta hai — jab customer baithe
 * (AVAILABLE → OCCUPIED), order complete ho (OCCUPIED → AVAILABLE),
 * ya koi table reserve ho (→ RESERVED).
 */
export async function updateTableStatus(
  tableId: string,
  outletId: string,
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED"
) {
  const table = await prisma.table.findFirst({ where: { id: tableId, outletId } });
  if (!table) notFound("Table not found in this outlet");

  return prisma.table.update({ where: { id: tableId }, data: { status } });
}