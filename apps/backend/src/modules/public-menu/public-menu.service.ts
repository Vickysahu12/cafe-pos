/**
 * PUBLIC MENU SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Customer QR ordering ka backend — bina login ke menu
 * dikhata hai aur order place karta hai. Outlet `slug` se identify
 * hota hai (URL mein hota hai: /order/test-cafe-indore), UUID nahi
 * dikhaya customer ko, jaisa humne Day 1 mein design kiya tha.
 *
 * SECURITY NOTE: Yeh saara data PUBLIC hai (koi bhi bina login
 * access kar sakta hai), isliye sirf woh cheezein return karte hain
 * jo customer ko dikhni chahiye — passwordHash jaisi sensitive
 * fields kabhi yahan se return nahi honi chahiye.
 *
 * CONNECTED TO:
 * - config/db.ts               → Prisma client
 * - public-menu.controller.ts    → HTTP layer isko call karta hai
 * - orders.service.ts            → order creation logic REUSE karta hai
 *   (price calculation, order-number counter, sab wahi hai — sirf
 *   cashierId null jaata hai aur outletId slug se resolve hota hai)
 */

import { prisma } from "../../config/db";
import { createOrder as createOrderInternal } from "../orders/orders.service";
import type { CreateOrderInput } from "@cafe-pos/shared-schemas";

function notFound(message: string): never {
  const err: any = new Error(message);
  err.statusCode = 404;
  throw err;
}

/**
 * USE CASE: Slug se outlet resolve karta hai — public routes ka
 * pehla step hamesha yehi hota hai (URL se outletId nikalna, bina JWT ke)
 */
async function resolveOutletBySlug(slug: string) {
  const outlet = await prisma.outlet.findUnique({ where: { slug } });
  if (!outlet) notFound("Cafe not found");
  return outlet;
}

/**
 * USE CASE: Customer-facing menu — sirf AVAILABLE categories/products
 * dikhate hain (out-of-stock items customer ko dikhne hi nahi chahiye,
 * warna woh order karke phir cancel karwana padega). isAvailable: false
 * wale products yahan se automatically exclude ho jaate hain.
 */
export async function getPublicMenu(slug: string, tableId?: string) {
  const outlet = await resolveOutletBySlug(slug);

  // FIX (2026-09-30): `select` — pehle poore DB rows (outletId, categoryId, timestamps,
  // archivedAt...) public response mein jaate the. Customer ko sirf yeh fields chahiye,
  // aur chhota JSON 4G pe menu jaldi kholta hai.
  const categories = await prisma.category.findMany({
    where: { outletId: outlet.id, isAvailable: true, archivedAt: null }, // FIX (2026-09-29): deleted categories hide
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      products: {
        where: { isAvailable: true, archivedAt: null }, // FIX (2026-09-29): deleted products hide
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          isVeg: true,
          taxRate: true,
          variants: { select: { id: true, name: true, price: true }, orderBy: { price: "asc" } },
          addons: { select: { id: true, name: true, price: true } },
        },
      },
    },
  });

  // FIX (2026-09-30): PER-TABLE QR. Table ke QR mein `?table=<tableId>` hota hai —
  // yahan verify karte hain ki woh table ISI cafe ki hai, aur customer ko table number
  // dikhate hain ("Table 5"). Galat/purana id ho to chupchaap null (menu phir bhi khule).
  let table: { id: string; tableNumber: string } | null = null;
  if (tableId && /^[0-9a-f-]{36}$/i.test(tableId)) {
    table = await prisma.table.findFirst({
      where: { id: tableId, outletId: outlet.id },
      select: { id: true, tableNumber: true },
    });
  }

  return {
    outlet: { name: outlet.name, address: outlet.address },
    table,
    categories,
  };
}

/**
 * USE CASE: Customer order place karta hai — orders.service.ts ka
 * createOrder() hi reuse hota hai (price calculation, order-number,
 * sab identical logic), bas cashierId null jaata hai (yeh Cashier
 * ne nahi, customer ne khud banaya) aur outletId slug se aata hai
 * na ki JWT se (kyunki customer login hi nahi hai).
 */
export async function createPublicOrder(slug: string, input: CreateOrderInput) {
  const outlet = await resolveOutletBySlug(slug);
  return createOrderInternal(input, outlet.id, null);
}

/**
 * USE CASE: Customer apne order ka live status check karta hai —
 * QR page pe "Preparing... Ready..." wala polling isi se chalega.
 * Sirf outlet ke andar hi order dhoondhta hai (dusre outlet ka order
 * ID daal ke koi access na kar sake).
 */
export async function getPublicOrderStatus(slug: string, orderId: string) {
  const outlet = await resolveOutletBySlug(slug);

  const order = await prisma.order.findFirst({
    where: { id: orderId, outletId: outlet.id },
    // FIX (2026-09-30): customer ke status page pe sahi bill dikhane ke liye item
    // prices, tax, table aur order type bhi (pehle page har item ke saath poore order
    // ka total dikhata tha kyunki item price aata hi nahi tha)
    select: {
      id: true,
      orderNumber: true,
      orderType: true,
      orderStatus: true,
      paymentStatus: true,
      totalAmount: true,
      taxAmount: true,
      discountAmount: true,
      netAmount: true,
      createdAt: true,
      table: { select: { tableNumber: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          status: true,
          totalPrice: true,
          product: { select: { name: true, isVeg: true } },
        },
      },
    },
  });
  if (!order) notFound("Order not found");
  return order;
}