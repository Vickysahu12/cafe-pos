/**
 * REVIEWS SERVICE: "Review Booster"
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-05)
 *
 * USE CASE: Cafe ko zyada Google reviews, sahi tareeke se.
 *  - Owner apna Google "write a review" link save karta hai (googleReviewUrl)
 *  - Customer: counter ke review card (QR) / WhatsApp bill / order-tracking page pe
 *    "⭐ Rate us on Google" (SABKO) + "💬 Tell the owner privately" (optional)
 *  - Owner app mein: private feedback + ginti (card scans, Google taps, messages)
 *
 * GOOGLE POLICY (bahut zaroori): "review gating" mana hai, yaani rating dekh ke sirf khush
 * customers ko Google bhejna. Isliye hum KABHI rating nahi poochte aur Google button hamesha
 * sabko dikhta hai; private message sirf ek extra option hai. Ise badalna = cafe ka
 * Google profile suspend hone ka risk.
 *
 * PRIVACY: customer ka phone/email kabhi nahi. Sirf message + optional naam.
 *
 * CONNECTED TO: reviews.routes.ts (Owner/Manager APIs), public-menu.* (public APIs),
 *               apps/web/app/review/[slug], apps/mobile/app/(admin)/reviews.tsx
 */

import { prisma } from "../../config/db";
import { getISTDateOnly } from "../../utils/date";

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  throw err;
}

/**
 * Sirf Google ke review links allowed. Kyun: yeh link HAR customer ke phone pe khulta hai,
 * to galti se (ya hacked account se) koi phishing/scam link na lag jaaye.
 * Google "Ask for reviews" ka link: https://g.page/r/<id>/review. Kabhi kabhi
 * search.google.com/local/writereview?placeid=… ya maps.app.goo.gl/… bhi.
 */
const ALLOWED_REVIEW_HOSTS = new Set([
  "g.page",
  "search.google.com",
  "www.google.com",
  "google.com",
  "maps.google.com",
  "www.google.co.in",
  "google.co.in",
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
]);

export function normalizeGoogleReviewUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    httpError("That doesn't look like a link. Copy it from Google Business Profile → Ask for reviews.", 400, "INVALID_REVIEW_URL");
  }
  if (!ALLOWED_REVIEW_HOSTS.has(url.hostname.toLowerCase())) {
    httpError("Only Google review links are allowed (they usually start with g.page/r/…).", 400, "INVALID_REVIEW_URL");
  }
  url.protocol = "https:";
  return url.toString();
}

/** Owner/Manager: link save ya hatao (null). Audit log same transaction mein. */
export async function updateReviewSettings(outletId: string, userId: string, googleReviewUrl: string | null) {
  const value = googleReviewUrl ? normalizeGoogleReviewUrl(googleReviewUrl) : null;
  return prisma.$transaction(async (tx) => {
    const before = await tx.outlet.findUnique({ where: { id: outletId }, select: { googleReviewUrl: true } });
    const outlet = await tx.outlet.update({
      where: { id: outletId },
      data: { googleReviewUrl: value },
      select: { googleReviewUrl: true },
    });
    // Link har customer ke phone pe khulta hai, to badlaav ka record zaroori (kisne, kab, kya)
    await tx.auditLog.create({
      data: {
        userId,
        outletId,
        action: "UPDATE_REVIEW_LINK",
        metadata: { from: before?.googleReviewUrl ?? null, to: value },
      },
    });
    return outlet;
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Owner screen ka header: link + pichle N din ki ginti */
export async function getReviewSummary(outletId: string, days = 30) {
  const since = getISTDateOnly(new Date(Date.now() - (days - 1) * DAY_MS));
  const [outlet, stats, feedbackCount, unread] = await Promise.all([
    prisma.outlet.findUnique({ where: { id: outletId }, select: { googleReviewUrl: true, slug: true, name: true } }),
    prisma.reviewStat.aggregate({
      where: { outletId, date: { gte: since } },
      _sum: { cardViews: true, googleClicks: true },
    }),
    prisma.feedback.count({ where: { outletId, createdAt: { gte: since } } }),
    prisma.feedback.count({ where: { outletId, readAt: null } }),
  ]);
  return {
    googleReviewUrl: outlet?.googleReviewUrl ?? null,
    slug: outlet?.slug ?? null,
    outletName: outlet?.name ?? null,
    days,
    cardScans: stats._sum.cardViews ?? 0,
    googleTaps: stats._sum.googleClicks ?? 0,
    privateMessages: feedbackCount,
    unread,
  };
}

/** Private feedback list — naya pehle, max 100 (chhote cafe ke liye kaafi; baad mein pagination) */
export async function listFeedback(outletId: string) {
  return prisma.feedback.findMany({
    where: { outletId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, message: true, name: true, source: true, createdAt: true, readAt: true, orderId: true },
  });
}

/** Screen khulte hi sab "read" — unread badge hat jaata hai */
export async function markAllFeedbackRead(outletId: string) {
  const { count } = await prisma.feedback.updateMany({
    where: { outletId, readAt: null },
    data: { readAt: new Date() },
  });
  return { marked: count };
}

// ─────────────────────────── PUBLIC (customer side) ───────────────────────────

/** Review page ke liye — sirf naam + link (koi internal id nahi) */
export async function getPublicReviewInfo(slug: string) {
  const outlet = await prisma.outlet.findUnique({
    where: { slug },
    select: { name: true, slug: true, googleReviewUrl: true },
  });
  if (!outlet) httpError("Cafe not found", 404);
  return outlet;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function submitFeedback(
  slug: string,
  input: { message: string; name?: string; orderId?: string; source: "CARD" | "BILL" | "STATUS" }
) {
  const outlet = await prisma.outlet.findUnique({ where: { slug }, select: { id: true } });
  if (!outlet) httpError("Cafe not found", 404);

  // orderId sirf tab rakho jab woh ISI cafe ka ho (warna chupchaap hata do — feedback phir bhi jaaye)
  let orderId: string | null = null;
  if (input.orderId && UUID_RE.test(input.orderId)) {
    const order = await prisma.order.findFirst({ where: { id: input.orderId, outletId: outlet.id }, select: { id: true } });
    orderId = order?.id ?? null;
  }

  await prisma.feedback.create({
    data: {
      outletId: outlet.id,
      message: input.message,
      name: input.name || null,
      orderId,
      source: input.source,
    },
  });
}

/** Ginti: card scan (review page khula) ya Google tap. Atomic upsert — OrderCounter jaisa. */
export async function recordReviewEvent(slug: string, type: "CARD_VIEW" | "GOOGLE_CLICK") {
  const outlet = await prisma.outlet.findUnique({ where: { slug }, select: { id: true } });
  if (!outlet) httpError("Cafe not found", 404);
  const date = getISTDateOnly();
  const field = type === "CARD_VIEW" ? "cardViews" : "googleClicks";
  await prisma.reviewStat.upsert({
    where: { outletId_date: { outletId: outlet.id, date } },
    update: { [field]: { increment: 1 } },
    create: { outletId: outlet.id, date, [field]: 1 },
  });
}
