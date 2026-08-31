/**
 * ORGANIZATION SERVICE
 * ─────────────────────────────────────────────────────────
 * USE CASE: Organization aur Outlet ki details read/update karta hai.
 * CREATE already auth.service.ts mein hai (registerOrganization ke
 * andar, Owner signup ke saath atomic) — yeh module sirf existing
 * org/outlet ko manage karne ke liye hai, naya banane ke liye nahi.
 *
 * CONNECTED TO:
 * - config/db.ts               → Prisma client
 * - organization.controller.ts   → HTTP layer isko call karta hai
 * - prisma/schema.prisma         → Organization, Outlet models
 */

import { prisma } from "../../config/db";

function notFound(message: string): never {
  const err: any = new Error(message);
  err.statusCode = 404;
  throw err;
}

/** USE CASE: Current outlet ki details deta hai — Owner/Manager settings screen ke liye */
export async function getOutlet(outletId: string) {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    include: { organization: true },
  });
  if (!outlet) notFound("Outlet not found");
  return outlet;
}

/**
 * USE CASE: Outlet details update karta hai (naam, address, phone, GST
 * number) — sirf outlet-level fields, naya outlet banana ya organization
 * ka naam change karna is scope mein nahi (woh alag, rarer operation hai)
 */
export async function updateOutlet(
  outletId: string,
  input: { name?: string; address?: string; phone?: string; gstNumber?: string }
) {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) notFound("Outlet not found");

  return prisma.outlet.update({ where: { id: outletId }, data: input });
}

/**
 * USE CASE: Ek Organization ke saare outlets list karta hai — future
 * multi-outlet feature ke liye zaroori (Owner jab dusra outlet add karega,
 * usse saare outlets ek dashboard mein dikhne chahiye). Abhi single-outlet
 * hi hai per organization typically, but yeh query already scale karti hai.
 */
export async function getOrganizationOutlets(organizationId: string) {
  return prisma.outlet.findMany({ where: { organizationId } });
}