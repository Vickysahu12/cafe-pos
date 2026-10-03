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

  // ADDED (2026-10-02): "Popular" row — sirf ASLI best sellers (last 30 din, quantity
  // se), koi fake "bestseller" tag nahi. Sirf woh ids jo abhi menu mein available hain.
  const availableIds = new Set(categories.flatMap((c) => c.products.map((p) => p.id)));
  const popular = (await getPopularProductIds(outlet.id)).filter((id) => availableIds.has(id));

  return {
    outlet: { name: outlet.name, address: outlet.address },
    table,
    categories,
    popular,
  };
}

/**
 * ADDED (2026-10-02): Cafe ke top 6 items (last 30 din, cancelled orders chhod ke).
 * USE CASE: customer menu ka "Popular here" row.
 * SCALE: har QR scan pe yeh query na chale isliye 10 min ka in-memory cache per
 * outlet (1000 cafes = max ~1000 chhote entries). orders(outletId, createdAt) index
 * pe chalti hai. Multi-server pe har server ka apna cache — theek hai, data 10 min
 * purana ho sakta hai, popular list ke liye koi farak nahi.
 */
const POPULAR_TTL_MS = 10 * 60 * 1000;
const POPULAR_CACHE_MAX = 5000;
const popularCache = new Map<string, { ids: string[]; at: number }>();

async function getPopularProductIds(outletId: string): Promise<string[]> {
  const hit = popularCache.get(outletId);
  if (hit && Date.now() - hit.at < POPULAR_TTL_MS) return hit.ids;

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT oi."productId" AS id
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE o."outletId" = ${outletId}
      AND o."createdAt" >= ${since}
      AND o."orderStatus" <> 'CANCELLED'
    GROUP BY oi."productId"
    ORDER BY SUM(oi.quantity) DESC
    LIMIT 6
  `;
  const ids = rows.map((r) => r.id);

  if (popularCache.size >= POPULAR_CACHE_MAX) popularCache.clear(); // memory bounded
  popularCache.set(outletId, { ids, at: Date.now() });
  return ids;
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
      updatedAt: true, // ADDED (2026-10-02): status page pe "Updated 2 min ago"
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