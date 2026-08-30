/**
 * MENU SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Saara database logic yahan hai — Category aur Product
 * create/read/update karne ke liye. Controller ise call karta hai,
 * yeh khud kisi HTTP cheez (req/res) ko nahi jaanta — sirf data
 * lekar Prisma se baat karta hai. Isse alag isliye rakha hai taaki
 * kal agar hum yeh logic kahin aur (jaise a cron job) se bhi use
 * karna chahein, controller/route pe depend na karna pade.
 *
 * CONNECTED TO:
 * - config/db.ts            → Prisma client yahan se aata hai
 * - menu.controller.ts       → is service ke functions ko call karta hai
 * - packages/shared-schemas  → input types yahan se aate hain (Zod-inferred)
 */

import { prisma } from "../../config/db";
import type { CreateCategoryInput, CreateProductInput } from "@cafe-pos/shared-schemas";

// ─────────────────────────────────────────────
// CATEGORY
// ─────────────────────────────────────────────

/**
 * USE CASE: Naya category banata hai (jaise "Beverages", "Starters").
 * outletId JWT se aata hai (req.user.outletId), body se nahi —
 * isliye Cashier A ka outlet, Cashier B ke outlet mein category
 * nahi bana sakta, chahe woh outletId body mein manually bhi bhej de.
 */
export async function createCategory(input: CreateCategoryInput, outletId: string) {
  return prisma.category.create({
    data: {
      name: input.name,
      outletId, // JWT se aaya hai — trusted source, body se nahi liya
      sortOrder: input.sortOrder ?? 0,
      isAvailable: input.isAvailable ?? true,
    },
  });
}

/**
 * USE CASE: Ek outlet ke saare categories laata hai, products count
 * ke saath — Cashier app ka menu grid isi se banega (Phase: mobile).
 */
export async function getCategories(outletId: string) {
  return prisma.category.findMany({
    where: { outletId },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

/**
 * USE CASE: Existing category update karta hai (naam, sort order, etc).
 * SECURITY CHECK: pehle verify karta hai category isi outlet ki hai —
 * warna Outlet A ka Manager, Outlet B ka category edit kar sakta tha
 * agar sirf categoryId pata ho. Yeh multi-tenant isolation ke liye zaroori hai.
 */
export async function updateCategory(
  categoryId: string,
  outletId: string,
  input: Partial<CreateCategoryInput>
) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, outletId } });
  if (!category) {
    const err: any = new Error("Category not found in your outlet");
    err.statusCode = 404;
    throw err;
  }

  return prisma.category.update({
    where: { id: categoryId },
    data: input,
  });
}

// ─────────────────────────────────────────────
// PRODUCT
// ─────────────────────────────────────────────

/**
 * USE CASE: Naya product banata hai — variants (Small/Medium/Large)
 * aur addons (Extra Cheese) ek hi request mein nested create ho jate
 * hain, Prisma ke `create: { ... }` relation syntax se — teen alag
 * API calls nahi karni padtin frontend ko.
 */
export async function createProduct(input: CreateProductInput, outletId: string) {
  // Category isi outlet ki honi chahiye — warna galat outlet ke
  // category ID se product bana sakte the (cross-tenant leak)
  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, outletId },
  });
  if (!category) {
    const err: any = new Error("Category not found in your outlet");
    err.statusCode = 404;
    throw err;
  }

  return prisma.product.create({
    data: {
      name: input.name,
      description: input.description,
      price: input.price,
      categoryId: input.categoryId,
      outletId,
      isAvailable: input.isAvailable ?? true,
      taxRate: input.taxRate ?? 0,
      isVeg: input.isVeg,
      variants: input.variants ? { create: input.variants } : undefined,
      addons: input.addons ? { create: input.addons } : undefined,
    },
    include: { variants: true, addons: true },
  });
}

/**
 * USE CASE: Products list karta hai, filter ke saath — Cashier billing
 * screen aur customer QR menu (Phase: public-menu module) dono isi
 * pattern ko reuse karenge (bas outlet-scoping thodi alag hogi wahan).
 *
 * FILTERS: categoryId (dropdown se), search (naam se dhoondhne ke liye),
 * isAvailable (out-of-stock items hide/show karne ke liye)
 */
export async function getProducts(
  outletId: string,
  filters: { categoryId?: string; search?: string; isAvailable?: boolean }
) {
  return prisma.product.findMany({
    where: {
      outletId,
      categoryId: filters.categoryId,
      isAvailable: filters.isAvailable,
      name: filters.search ? { contains: filters.search, mode: "insensitive" } : undefined,
    },
    include: { variants: true, addons: true, category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}

/**
 * USE CASE: PRD ka "Quick toggle for out-of-stock items" feature —
 * Cashier billing screen pe ek button hoga jo product ko turant
 * available/unavailable kar de (jaise doodh khatam ho gaya toh
 * "Cold Coffee" turant hide karna).
 */
export async function toggleProductAvailability(
  productId: string,
  outletId: string,
  isAvailable: boolean
) {
  const product = await prisma.product.findFirst({ where: { id: productId, outletId } });
  if (!product) {
    const err: any = new Error("Product not found in your outlet");
    err.statusCode = 404;
    throw err;
  }

  return prisma.product.update({ where: { id: productId }, data: { isAvailable } });
}