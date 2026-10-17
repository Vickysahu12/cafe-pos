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
import { logAuditAction } from "../../middleware/audit-logger";
import { PAUSED_INDEFINITELY, orderingStatus } from "../../utils/ordering";

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
  // ADDED (2026-10-17): app ko seedha { open, pausedUntil } — time ka hisaab server kare
  return { ...outlet, ordering: orderingStatus(outlet.ordersPausedUntil) };
}

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}

/**
 * ADDED (2026-10-17): SOLO / TEAM. SOLO tabhi jab koi active staff na ho — warna staff login
 * karta rahega par Owner ko Staff screen dikhegi hi nahi (koi unhe band nahi kar payega).
 */
export async function setWorkMode(outletId: string, userId: string, workMode: "SOLO" | "TEAM") {
  if (workMode === "SOLO") {
    const staff = await prisma.user.findMany({
      where: { outletId, role: { not: "OWNER" }, isActive: true },
      select: { name: true },
      take: 5,
    });
    if (staff.length > 0) {
      const names = staff.map((s) => s.name).join(", ");
      httpError(
        `You still have active staff (${names}). Turn them off in More → Staff first, or keep "With staff".`,
        409,
        "STAFF_EXISTS"
      );
    }
  }
  const outlet = await prisma.outlet.update({ where: { id: outletId }, data: { workMode } });
  await logAuditAction({ userId, outletId, action: "WORK_MODE_CHANGED", metadata: { workMode } });
  return { ...outlet, ordering: orderingStatus(outlet.ordersPausedUntil) };
}

/**
 * ADDED (2026-10-18): UPI QR. Naya/badla UPI ID = verify reset (Owner ko ₹1 test dobara karna hoga).
 * Wahi ID dobara save → verify bana rahe (sirf naam badla). Audit: kisne kab badla (staff fraud ka jawab).
 */
export async function setUpi(outletId: string, userId: string, input: { upiId: string | null; upiName?: string }) {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) notFound("Outlet not found");
  if (input.upiId && !input.upiName && !outlet.upiName) {
    httpError("Enter the name customers should see", 400, "UPI_NAME_REQUIRED");
  }
  const idChanged = (input.upiId ?? null) !== (outlet.upiId ?? null);
  const updated = await prisma.outlet.update({
    where: { id: outletId },
    data: input.upiId
      ? { upiId: input.upiId, upiName: input.upiName ?? outlet.upiName, ...(idChanged ? { upiVerifiedAt: null } : {}) }
      : { upiId: null, upiName: null, upiVerifiedAt: null },
  });
  if (idChanged || input.upiName !== undefined) {
    await logAuditAction({
      userId,
      outletId,
      action: "UPI_ID_CHANGED",
      metadata: { from: outlet.upiId, to: updated.upiId },
    });
  }
  return { ...updated, ordering: orderingStatus(updated.ordersPausedUntil) };
}

/** ADDED (2026-10-18): Owner ne ₹1 khud ko bheja, sahi naam aaya → ab checkout pe UPI QR dikhega */
export async function verifyUpi(outletId: string, userId: string) {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId } });
  if (!outlet) notFound("Outlet not found");
  if (!outlet.upiId) httpError("Add your UPI ID first", 400, "UPI_NOT_SET");
  const updated = await prisma.outlet.update({ where: { id: outletId }, data: { upiVerifiedAt: new Date() } });
  await logAuditAction({ userId, outletId, action: "UPI_VERIFIED", metadata: { upiId: updated.upiId } });
  return { ...updated, ordering: orderingStatus(updated.ordersPausedUntil) };
}

/** ADDED (2026-10-17): online (QR + website) orders pause/resume. Audit hota hai (kisne band kiya). */
export async function setOnlineOrders(outletId: string, userId: string, input: { paused: boolean; minutes?: number }) {
  const ordersPausedUntil = !input.paused
    ? null
    : input.minutes
      ? new Date(Date.now() + input.minutes * 60 * 1000)
      : PAUSED_INDEFINITELY;
  const outlet = await prisma.outlet.update({ where: { id: outletId }, data: { ordersPausedUntil } });
  await logAuditAction({
    userId,
    outletId,
    action: input.paused ? "ONLINE_ORDERS_PAUSED" : "ONLINE_ORDERS_RESUMED",
    metadata: input.paused ? { minutes: input.minutes ?? null } : undefined,
  });
  return orderingStatus(outlet.ordersPausedUntil);
}

/**
 * USE CASE: Outlet details update karta hai (naam, address, phone, GST
 * number) — sirf outlet-level fields, naya outlet banana ya organization
 * ka naam change karna is scope mein nahi (woh alag, rarer operation hai)
 */
export async function updateOutlet(
  outletId: string,
  // UPDATED (2026-10-11): delivery settings bhi (UpdateOutletSchema validate karta hai)
  // NOTE (2026-10-18): UPI yahan se KABHI nahi — sirf setUpi() (verify reset + audit) se
  input: {
    name?: string; address?: string; phone?: string; gstNumber?: string;
    deliveryEnabled?: boolean; deliveryCharge?: number; deliveryMinOrder?: number; deliveryArea?: string | null;
  }
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