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
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateProductInput,
  UpdateProductInput,
} from "@cafe-pos/shared-schemas";

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
  // FIX (2026-09-29): archived (deleted) categories/products list aur count se bahar
  return prisma.category.findMany({
    where: { outletId, archivedAt: null },
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { archivedAt: null } } } } },
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
  input: UpdateCategoryInput
) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, outletId, archivedAt: null } });
  if (!category) {
    const err: any = new Error("Category not found in your outlet");
    err.statusCode = 404;
    throw err;
  }

  // FIX (2026-09-29): pehle `data: input` tha (poori request body seedha Prisma
  // ko) — body mein `outletId` ya nested relation ops bhej ke category doosre
  // outlet mein move ho sakti thi. Ab fields explicitly pick karte hain; route
  // pe UpdateCategorySchema.strict() bhi extra keys reject karta hai (defense in depth).
  return prisma.category.update({
    where: { id: categoryId },
    data: {
      name: input.name,
      sortOrder: input.sortOrder,
      isAvailable: input.isAvailable,
    },
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
    where: { id: input.categoryId, outletId, archivedAt: null },
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
      archivedAt: null, // FIX (2026-09-29): deleted products menu se bahar
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
  const product = await prisma.product.findFirst({ where: { id: productId, outletId, archivedAt: null } });
  if (!product) {
    const err: any = new Error("Product not found in your outlet");
    err.statusCode = 404;
    throw err;
  }

  return prisma.product.update({ where: { id: productId }, data: { isAvailable } });
}

// ─────────────────────────────────────────────
// FIX (2026-09-29): PRODUCT EDIT/DELETE + CATEGORY DELETE
// Pehle Owner ek baar product bana ke uska price tak nahi badal sakta tha,
// na galat product/category hata sakta tha.
// ─────────────────────────────────────────────

function menuError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}

/**
 * USE CASE: Product edit — naam, price, tax, category, variants/addons.
 * variants/addons diye to purane REPLACE hote hain (order_items sirf product
 * ko point karte hain, variant/addon ko nahi, isliye purane bills safe).
 * Price/tax change audit log mein "PRICE_CHANGE" likhta hai — zero-theft:
 * Owner dekh sake ki kisne kab price ghataya.
 */
export async function updateProduct(
  productId: string,
  outletId: string,
  userId: string,
  input: UpdateProductInput
) {
  const product = await prisma.product.findFirst({ where: { id: productId, outletId, archivedAt: null } });
  if (!product) menuError("Product not found in your outlet", 404);

  if (input.categoryId && input.categoryId !== product.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: input.categoryId, outletId, archivedAt: null },
    });
    if (!category) menuError("Category not found in your outlet", 404);
  }

  return prisma.$transaction(async (tx) => {
    if (input.variants) await tx.productVariant.deleteMany({ where: { productId } });
    if (input.addons) await tx.productAddon.deleteMany({ where: { productId } });

    const updated = await tx.product.update({
      where: { id: productId },
      data: {
        name: input.name,
        description: input.description,
        price: input.price,
        categoryId: input.categoryId,
        isAvailable: input.isAvailable,
        taxRate: input.taxRate,
        isVeg: input.isVeg,
        variants: input.variants ? { create: input.variants } : undefined,
        addons: input.addons ? { create: input.addons } : undefined,
      },
      include: { variants: true, addons: true, category: { select: { name: true } } },
    });

    const priceChanged = input.price !== undefined && input.price !== product.price;
    const taxChanged = input.taxRate !== undefined && input.taxRate !== product.taxRate;
    if (priceChanged || taxChanged) {
      await tx.auditLog.create({
        data: {
          userId,
          outletId,
          action: "PRICE_CHANGE",
          metadata: {
            productId,
            productName: updated.name,
            oldPrice: product.price,
            newPrice: updated.price,
            oldTaxRate: product.taxRate,
            newTaxRate: updated.taxRate,
          },
        },
      });
    }
    return updated;
  });
}

/**
 * USE CASE: Product delete. Agar product ka kabhi order hua hai to ARCHIVE
 * (purane bills ke liye row rehni chahiye — order_items FK RESTRICT hai),
 * warna poori tarah DELETE. Dono cases mein menu/billing/QR se turant gayab.
 */
export async function deleteProduct(productId: string, outletId: string, userId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, outletId, archivedAt: null } });
  if (!product) menuError("Product not found in your outlet", 404);

  const orderCount = await prisma.orderItem.count({ where: { productId } });
  await prisma.$transaction(async (tx) => {
    if (orderCount > 0) {
      await tx.product.update({
        where: { id: productId },
        data: { archivedAt: new Date(), isAvailable: false },
      });
    } else {
      await tx.product.delete({ where: { id: productId } }); // variants/addons cascade
    }
    await tx.auditLog.create({
      data: {
        userId,
        outletId,
        action: "DELETE_ITEM",
        metadata: { productId, productName: product.name, price: product.price, archived: orderCount > 0 },
      },
    });
  });
  return { id: productId };
}

/**
 * USE CASE: Category delete. Pehle uske ACTIVE products delete/move karne
 * padte hain (galti se poora "Beverages" section na ud jaaye). Agar sirf
 * archived products bache hain (jinke purane orders hain), category bhi archive.
 */
export async function deleteCategory(categoryId: string, outletId: string) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, outletId, archivedAt: null } });
  if (!category) menuError("Category not found in your outlet", 404);

  const activeProducts = await prisma.product.count({ where: { categoryId, archivedAt: null } });
  if (activeProducts > 0) {
    menuError(
      `This category still has ${activeProducts} item(s). Delete or move them first.`,
      409,
      "CATEGORY_NOT_EMPTY"
    );
  }

  const archivedProducts = await prisma.product.count({ where: { categoryId } });
  if (archivedProducts > 0) {
    await prisma.category.update({ where: { id: categoryId }, data: { archivedAt: new Date(), isAvailable: false } });
  } else {
    await prisma.category.delete({ where: { id: categoryId } });
  }
  return { id: categoryId };
}