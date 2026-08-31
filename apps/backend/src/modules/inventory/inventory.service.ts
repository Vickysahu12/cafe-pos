/**
 * INVENTORY SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Stock items ka CRUD — Manager naya stock item add
 * karta hai (jaise "Milk", "Coffee Beans"), quantity update karta
 * hai jaise stock aata/consume hota hai, aur agar quantity kisi
 * item ke liye set threshold se neeche jaaye, Owner ko flag milta
 * hai (PRD ka "Inventory needs to be filled up" wala flow).
 *
 * CONNECTED TO:
 * - config/db.ts             → Prisma client
 * - inventory.controller.ts    → HTTP layer isko call karta hai
 * - prisma/schema.prisma       → InventoryItem model
 * - packages/shared-schemas    → input types (naya schema banayenge)
 */

import { prisma } from "../../config/db";

function notFound(message: string): never {
  const err: any = new Error(message);
  err.statusCode = 404;
  throw err;
}

/**
 * USE CASE: Naya stock item add karta hai (jaise "Milk", qty 20 litres,
 * threshold 5 — matlab 5 litres se neeche jaate hi alert-worthy ho jayega)
 */
export async function createInventoryItem(
  input: { name: string; quantity: number; unit: string; lowStockAlertAt?: number },
  outletId: string
) {
  return prisma.inventoryItem.create({
    data: {
      name: input.name,
      quantity: input.quantity,
      unit: input.unit,
      lowStockAlertAt: input.lowStockAlertAt ?? 0,
      outletId,
    },
  });
}

/**
 * USE CASE: Outlet ke saare inventory items list karta hai — Manager ka
 * inventory screen isi se banega. Har item ke saath `isLowStock` flag
 * bhi compute karke bhejte hain, taaki frontend ko khud calculate na
 * karna pade — UI mein direct red badge dikha sakte hain.
 */
export async function getInventoryItems(outletId: string) {
  const items = await prisma.inventoryItem.findMany({
    where: { outletId },
    orderBy: { name: "asc" },
  });

  return items.map((item) => ({
    ...item,
    isLowStock: item.quantity <= item.lowStockAlertAt,
  }));
}

/**
 * USE CASE: Sirf woh items jo LOW STOCK hain — Owner dashboard ka
 * "Inventory needs to be filled up" alert widget isi endpoint se
 * seedha data lega, poori list se khud filter nahi karna padega.
 */
export async function getLowStockItems(outletId: string) {
  // Prisma direct column-to-column comparison support nahi karta
  // (quantity <= lowStockAlertAt WHERE clause mein), isliye pehle
  // sab laate hain aur JS mein filter karte hain — outlet ka
  // inventory list chhota hota hai (typically <100 items), isliye
  // yeh approach yahan performant hai
  const items = await prisma.inventoryItem.findMany({ where: { outletId } });
  return items.filter((item) => item.quantity <= item.lowStockAlertAt);
}

/**
 * USE CASE: Stock quantity update karta hai — naya stock aane pe
 * (increment) ya consumption/wastage track karne pe (decrement).
 * `mode: "SET" | "ADD"` do use-cases cover karta hai: "SET" jab Manager
 * exact count deta hai (stock-take ke baad), "ADD" jab naya stock aata
 * hai ya wastage entry hoti hai (negative number bhej ke).
 */
export async function updateInventoryQuantity(
  itemId: string,
  outletId: string,
  input: { mode: "SET" | "ADD"; quantity: number }
) {
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, outletId } });
  if (!item) notFound("Inventory item not found in this outlet");

  const newQuantity = input.mode === "SET" ? input.quantity : item.quantity + input.quantity;

  if (newQuantity < 0) {
    const err: any = new Error("Quantity cannot go below zero");
    err.statusCode = 400;
    throw err;
  }

  return prisma.inventoryItem.update({
    where: { id: itemId },
    data: { quantity: newQuantity },
  });
}

/**
 * USE CASE: Manager kisi item ka low-stock threshold badal sakta hai
 * (jaise "Milk" ke liye 5 litres se 10 litres kar dena, agar demand badh gayi)
 */
export async function updateThreshold(itemId: string, outletId: string, lowStockAlertAt: number) {
  const item = await prisma.inventoryItem.findFirst({ where: { id: itemId, outletId } });
  if (!item) notFound("Inventory item not found in this outlet");

  return prisma.inventoryItem.update({
    where: { id: itemId },
    data: { lowStockAlertAt },
  });
}