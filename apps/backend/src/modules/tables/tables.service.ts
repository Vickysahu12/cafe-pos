/**
 * TABLES SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Cafe ke dine-in tables manage karta hai — create karna,
 * list karna, aur status change karna (jab customer baithe/uthe).
 * Orders module isse already link hai (Order.tableId), yeh module
 * banne se dine-in flow poora ho jaata hai.
 *
 * UPDATED (2026-10-11) — TABLE EDIT (co-founder brief point 2):
 *  - Rename + seats badlo, delete (= archive, soft delete). Sirf Owner/Manager (routes).
 *  - Chalta hua order ho (cancel nahi, aur served+paid nahi — syncTableStatus wali definition)
 *    to delete NAHI hota → saaf message "Table 4 has a running order (#23)".
 *  - Naam per outlet unique (case-insensitive, sirf active tables mein) — do "Table 4" se
 *    cashier galat table pe bill kar deta. Archived table ka naam dobara use ho sakta hai.
 *  - List mein har table ke running orders bhi (tap → orders / naya bill) — ek hi extra query.
 *  - Archived table: billing, QR menu, naye orders — kahin nahi (orders.service, public-menu
 *    bhi archivedAt check karte hain). Purane bills pe table number wahi rehta hai.
 *  - Delete ka audit log (TABLE_DELETED) — owner dekh sake kisne hataya.
 *
 * CONNECTED TO:
 * - config/db.ts          → Prisma client
 * - tables.controller.ts    → HTTP layer isko call karta hai
 * - prisma/schema.prisma    → Table model
 * - orders.service.ts       → Order.tableId isi Table.id ko reference karta hai
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/db";
import { logAuditAction } from "../../middleware/audit-logger";

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}
function notFound(message: string): never {
  httpError(message, 404);
}

/** Table pe "chalta hua" order — orders.service syncTableStatus jaisi hi definition */
const ACTIVE_ORDER_WHERE: Prisma.OrderWhereInput = {
  NOT: [{ orderStatus: "CANCELLED" }, { orderStatus: "SERVED", paymentStatus: "PAID" }],
};

async function assertUniqueName(outletId: string, tableNumber: string, exceptId?: string) {
  const clash = await prisma.table.findFirst({
    where: {
      outletId,
      archivedAt: null,
      tableNumber: { equals: tableNumber, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) httpError(`A table called "${tableNumber}" already exists`, 409, "DUPLICATE_TABLE");
}

async function getActiveTable(tableId: string, outletId: string) {
  const table = await prisma.table.findFirst({ where: { id: tableId, outletId, archivedAt: null } });
  if (!table) notFound("Table not found in this outlet");
  return table;
}

/** USE CASE: Naya table banata hai (jaise "Table 5", capacity 4) */
export async function createTable(input: { tableNumber: string; capacity: number }, outletId: string) {
  await assertUniqueName(outletId, input.tableNumber);
  return prisma.table.create({
    data: { tableNumber: input.tableNumber, capacity: input.capacity, outletId },
  });
}

/**
 * USE CASE: Outlet ke saare tables list karta hai — Cashier ka
 * "table allocation" screen isi se banega, status ke saath
 * (AVAILABLE/OCCUPIED/RESERVED) taaki UI mein color-coding ho sake.
 * UPDATED (2026-10-11): archived nahi + har table ke running orders (activeOrders).
 */
export async function getTables(outletId: string) {
  const [tables, active] = await Promise.all([
    prisma.table.findMany({
      where: { outletId, archivedAt: null },
      orderBy: { tableNumber: "asc" },
    }),
    prisma.order.findMany({
      where: { outletId, tableId: { not: null }, ...ACTIVE_ORDER_WHERE },
      orderBy: { createdAt: "asc" },
      take: 300, // ek cafe mein ek saath itne running table orders kabhi nahi
      select: {
        id: true, tableId: true, orderNumber: true, netAmount: true, orderStatus: true,
        paymentStatus: true, createdAt: true, customerName: true, cashierId: true,
      },
    }),
  ]);
  const byTable = new Map<string, typeof active>();
  for (const o of active) {
    const list = byTable.get(o.tableId!) ?? [];
    list.push(o);
    byTable.set(o.tableId!, list);
  }
  return tables.map((t) => ({
    ...t,
    activeOrders: (byTable.get(t.id) ?? []).map(({ tableId: _t, cashierId, ...o }) => ({ ...o, isQr: cashierId === null })),
  }));
}

/** ADDED (2026-10-11): rename / seats */
export async function updateTable(
  tableId: string,
  outletId: string,
  input: { tableNumber?: string; capacity?: number }
) {
  await getActiveTable(tableId, outletId);
  if (input.tableNumber !== undefined) await assertUniqueName(outletId, input.tableNumber, tableId);
  return prisma.table.update({
    where: { id: tableId },
    data: {
      ...(input.tableNumber !== undefined ? { tableNumber: input.tableNumber } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
    },
  });
}

/**
 * ADDED (2026-10-11): delete = archive. Running order ho to mana. Transaction mein check +
 * archive — check aur archive ke beech koi naya order is table pe na aa jaaye (order create
 * archivedAt dekhta hai, aur yeh row lock karta hai).
 */
export async function archiveTable(tableId: string, outletId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; tableNumber: string }[]>`
      SELECT id, "tableNumber" FROM tables
      WHERE id = ${tableId} AND "outletId" = ${outletId} AND "archivedAt" IS NULL
      FOR UPDATE
    `;
    const table = rows[0];
    if (!table) notFound("Table not found in this outlet");

    const running = await tx.order.findFirst({
      where: { tableId, outletId, ...ACTIVE_ORDER_WHERE },
      orderBy: { createdAt: "asc" },
      select: { orderNumber: true },
    });
    if (running) {
      httpError(
        `${table.tableNumber} has a running order (#${running.orderNumber}). Finish or cancel it before deleting the table.`,
        409,
        "TABLE_IN_USE"
      );
    }
    await tx.table.update({ where: { id: tableId }, data: { archivedAt: new Date(), status: "AVAILABLE" } });
    await logAuditAction(
      { userId, outletId, action: "TABLE_DELETED", metadata: { tableId, tableNumber: table.tableNumber } },
      tx
    );
    return { id: tableId };
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
  await getActiveTable(tableId, outletId);
  return prisma.table.update({ where: { id: tableId }, data: { status } });
}
