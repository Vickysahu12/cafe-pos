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
export async function getPublicMenu(slug: string) {
  const outlet = await resolveOutletBySlug(slug);

  const categories = await prisma.category.findMany({
    where: { outletId: outlet.id, isAvailable: true },
    orderBy: { sortOrder: "asc" },
    include: {
      products: {
        where: { isAvailable: true },
        include: { variants: true, addons: true },
      },
    },
  });

  return {
    outlet: { name: outlet.name, address: outlet.address },
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
    select: {
      id: true,
      orderNumber: true,
      orderStatus: true,
      paymentStatus: true,
      netAmount: true,
      items: { select: { id: true, quantity: true, status: true, product: { select: { name: true } } } },
    },
  });
  if (!order) notFound("Order not found");
  return order;
}