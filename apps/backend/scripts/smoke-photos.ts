/**
 * ITEM PHOTOS SMOKE TEST (2026-10-18)
 * ─────────────────────────────────────────────────────────
 * USE CASE: Item photo ka poora flow ASLI ImageKit account ke against: signature → upload → verify →
 * item pe lagana → badalna → hatana → item delete → account delete. Roles, doosre cafe ki photo,
 * nakli fileId, non-image file — sab check. Har test file + DB data end mein delete.
 *
 * ⚠️ Sirf DEV database pe. ImageKit pe sirf 1×1 px test files jaati hain (aur delete ho jaati hain).
 *
 * KAISE CHALAYE:
 *   1. pnpm turbo run build --filter=backend
 *   2. (apps/backend mein)  PORT=3998 node dist/server.js      ← alag terminal (.env mein IMAGEKIT_* hon)
 *   3. (apps/backend mein)  SMOKE_URL=http://localhost:3998 npx tsx scripts/smoke-photos.ts
 *
 * CONNECTED TO: utils/imagekit.ts, modules/menu (photo routes), modules/auth (account delete)
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3998";
const API = `${BASE}/api/v1`;
const TAG = `smokeph${Date.now()}`;
const PASSWORD = "SmokeTest#12345";
const IK_AUTH = "Basic " + Buffer.from(`${process.env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");
// 1×1 PNG (valid image)
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const prisma = new PrismaClient();
let failures = 0;
const createdFileIds: string[] = [];

function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}`, detail === undefined ? "" : JSON.stringify(detail));
  }
}

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

/** App jaisa hi: signature lo → seedha ImageKit upload */
async function upload(auth: any, bytes: Buffer, name: string, type: string, folder = auth.folder) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  form.append("fileName", name);
  form.append("publicKey", auth.publicKey);
  form.append("signature", auth.signature);
  form.append("expire", String(auth.expire));
  form.append("token", auth.token);
  form.append("folder", folder);
  form.append("useUniqueFileName", "true");
  const res = await fetch(auth.uploadUrl, { method: "POST", body: form });
  const json: any = await res.json().catch(() => null);
  if (json?.fileId) createdFileIds.push(json.fileId);
  return { status: res.status, json };
}

const ikExists = async (fileId: string) =>
  (await fetch(`https://api.imagekit.io/v1/files/${fileId}/details`, { headers: { Authorization: IK_AUTH } })).status === 200;

async function createTenant(label: string) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const org = await prisma.organization.create({ data: { name: `${TAG}-${label}` } });
  const outlet = await prisma.outlet.create({
    data: { name: `${TAG} ${label}`, slug: `${TAG}-${label}`.toLowerCase(), address: "Test", phone: "9876543210", organizationId: org.id },
  });
  const mk = (role: "OWNER" | "MANAGER" | "CASHIER" | "CHEF") =>
    prisma.user.create({
      data: {
        name: `${label} ${role}`, email: `${TAG}-${label}-${role}@example.com`.toLowerCase(), phone: "9876543210",
        passwordHash, role, outletId: outlet.id, emailVerified: true, consentAcceptedAt: new Date(),
      },
    });
  const owner = await mk("OWNER");
  const manager = await mk("MANAGER");
  const cashier = await mk("CASHIER");
  const chef = await mk("CHEF");
  const category = await prisma.category.create({ data: { name: "Food", outletId: outlet.id } });
  const mkProduct = (name: string) =>
    prisma.product.create({ data: { name, price: 100, taxRate: 0, isVeg: true, categoryId: category.id, outletId: outlet.id } });
  return { org, outlet, owner, manager, cashier, chef, product: await mkProduct("Cold Coffee"), product2: await mkProduct("Veg Burger") };
}

async function login(email: string) {
  const r = await call("POST", "/auth/login", undefined, { email, password: PASSWORD });
  if (r.status !== 200) throw new Error(`login failed ${email}: ${JSON.stringify(r.json)}`);
  return r.json.data.accessToken as string;
}

async function main() {
  if (!process.env.IMAGEKIT_PRIVATE_KEY) throw new Error("IMAGEKIT_PRIVATE_KEY missing in .env");
  console.log(`Photo smoke test against ${BASE} (tag ${TAG})`);
  const A = await createTenant("A");
  const B = await createTenant("B");
  let aDeleted = false;

  try {
    const aOwner = await login(A.owner.email);
    const aManager = await login(A.manager.email);
    const aCashier = await login(A.cashier.email);
    const aChef = await login(A.chef.email);
    const bOwner = await login(B.owner.email);

    console.log("\nUpload permission");
    const cashierAuth = await call("GET", `/menu/products/${A.product.id}/image-auth`, aCashier);
    check("cashier can't get upload permission → 403", cashierAuth.status === 403, cashierAuth.status);
    const chefAuth = await call("GET", `/menu/products/${A.product.id}/image-auth`, aChef);
    check("chef can't get upload permission → 403", chefAuth.status === 403, chefAuth.status);
    const crossAuth = await call("GET", `/menu/products/${A.product.id}/image-auth`, bOwner);
    check("café B can't get permission for café A's item → 404", crossAuth.status === 404, crossAuth.json);
    const auth = await call("GET", `/menu/products/${A.product.id}/image-auth`, aOwner);
    const a = auth.json?.data;
    check("owner gets a one-time signature for own café folder (no private key in response)",
      auth.status === 200 && a?.signature && a?.folder === `/outlets/${A.outlet.id}/products` && !JSON.stringify(a).includes("private_"), a);
    const mAuth = await call("GET", `/menu/products/${A.product.id}/image-auth`, aManager);
    check("manager can also add photos → 200", mAuth.status === 200, mAuth.status);

    console.log("\nUpload + attach");
    const up1 = await upload(a, PNG, "coffee.png", "image/png");
    check("photo uploads straight to ImageKit", up1.status === 200 && !!up1.json?.fileId, up1.json);
    const reuse = await upload(a, PNG, "again.png", "image/png");
    check("same signature can't be reused → rejected by ImageKit", reuse.status >= 400, reuse.status);
    const set1 = await call("PUT", `/menu/products/${A.product.id}/image`, aOwner, { fileId: up1.json.fileId });
    check("attach → item has the ImageKit photo URL", set1.status === 200 && typeof set1.json?.data?.imageUrl === "string" && set1.json.data.imageUrl.includes("ik.imagekit.io"), set1.json);
    const photoUrl = set1.json?.data?.imageUrl as string;

    const menu = await call("GET", `/public/${A.outlet.slug}/menu`);
    const pubProduct = menu.json?.data?.categories?.[0]?.products?.find((p: any) => p.id === A.product.id);
    check("customer menu (public API) shows the photo", pubProduct?.imageUrl === photoUrl, pubProduct);
    check("public menu doesn't expose the ImageKit fileId", pubProduct && !("imageFileId" in pubProduct), Object.keys(pubProduct ?? {}));
    const thumb = await fetch(`${photoUrl}?tr=w-100,h-100`);
    check("small thumbnail URL works (image/*)", thumb.status === 200 && (thumb.headers.get("content-type") ?? "").startsWith("image/"), [thumb.status, thumb.headers.get("content-type")]);

    console.log("\nAbuse");
    const fake = await call("PUT", `/menu/products/${A.product.id}/image`, aOwner, { fileId: "abcdef123456" });
    check("made-up fileId → 400, item unchanged", fake.status === 400, fake.json);
    const crossFile = await call("PUT", `/menu/products/${B.product.id}/image`, bOwner, { fileId: up1.json.fileId });
    check("café B attaching café A's photo → 400 (folder check)", crossFile.status === 400 && crossFile.json?.error?.code === "PHOTO_NOT_FOUND", crossFile.json);
    const bAuth = (await call("GET", `/menu/products/${B.product.id}/image-auth`, bOwner)).json.data;
    const sneaky = await upload(bAuth, PNG, "sneaky.png", "image/png", `/outlets/${A.outlet.id}/products`);
    const sneakySet = await call("PUT", `/menu/products/${B.product.id}/image`, bOwner, { fileId: sneaky.json?.fileId ?? "x" });
    check("café B uploading into café A's folder can't attach it to B's item → 400", sneakySet.status === 400, sneakySet.json);
    const txtAuth = (await call("GET", `/menu/products/${A.product2.id}/image-auth`, aOwner)).json.data;
    const txt = await upload(txtAuth, Buffer.from("not an image"), "note.txt", "text/plain");
    if (txt.json?.fileId) {
      const txtSet = await call("PUT", `/menu/products/${A.product2.id}/image`, aOwner, { fileId: txt.json.fileId });
      check("non-image file → 400 PHOTO_INVALID and deleted from ImageKit", txtSet.status === 400 && txtSet.json?.error?.code === "PHOTO_INVALID" && !(await ikExists(txt.json.fileId)), txtSet.json);
    } else {
      check("non-image file rejected by ImageKit at upload", txt.status >= 400, txt.json);
    }
    const editPatch = await call("PATCH", `/menu/products/${A.product2.id}`, aOwner, { imageUrl: "https://evil.example/x.jpg" });
    const p2 = await prisma.product.findUnique({ where: { id: A.product2.id } });
    check("normal item edit can't set imageUrl directly", p2?.imageUrl === null, [editPatch.status, p2?.imageUrl]);

    console.log("\nReplace / remove / delete");
    const auth2 = (await call("GET", `/menu/products/${A.product.id}/image-auth`, aOwner)).json.data;
    const up2 = await upload(auth2, PNG, "coffee2.png", "image/png");
    const set2 = await call("PUT", `/menu/products/${A.product.id}/image`, aOwner, { fileId: up2.json.fileId });
    check("change photo → new URL", set2.status === 200 && set2.json?.data?.imageUrl !== photoUrl, set2.json?.data?.imageUrl);
    check("old photo deleted from ImageKit", !(await ikExists(up1.json.fileId)));
    const again = await call("PUT", `/menu/products/${A.product.id}/image`, aOwner, { fileId: up2.json.fileId });
    check("same photo again → 200, still there", again.status === 200 && (await ikExists(up2.json.fileId)), again.json);
    const cashierRemove = await call("DELETE", `/menu/products/${A.product.id}/image`, aCashier);
    check("cashier can't remove a photo → 403", cashierRemove.status === 403, cashierRemove.status);
    const removed = await call("DELETE", `/menu/products/${A.product.id}/image`, aOwner);
    check("remove → item has no photo, file deleted", removed.status === 200 && removed.json?.data?.imageUrl === null && !(await ikExists(up2.json.fileId)), removed.json?.data);

    const auth3 = (await call("GET", `/menu/products/${A.product2.id}/image-auth`, aOwner)).json.data;
    const up3 = await upload(auth3, PNG, "burger.png", "image/png");
    await call("PUT", `/menu/products/${A.product2.id}/image`, aOwner, { fileId: up3.json.fileId });
    const del = await call("DELETE", `/menu/products/${A.product2.id}`, aOwner);
    check("delete item → its photo deleted from ImageKit", del.status === 200 && !(await ikExists(up3.json.fileId)), del.json);

    console.log("\nAccount delete");
    const auth4 = (await call("GET", `/menu/products/${A.product.id}/image-auth`, aOwner)).json.data;
    const up4 = await upload(auth4, PNG, "last.png", "image/png");
    await call("PUT", `/menu/products/${A.product.id}/image`, aOwner, { fileId: up4.json.fileId });
    const delAcc = await call("DELETE", "/auth/account", aOwner, { password: PASSWORD, confirmText: "DELETE" });
    aDeleted = delAcc.status === 200;
    // folder delete ImageKit pe async hota hai — thoda ruk ke check
    let gone = false;
    for (let i = 0; i < 10 && !gone; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      gone = !(await ikExists(up4.json.fileId));
    }
    check("delete café account → all its photos deleted from ImageKit", aDeleted && gone, [delAcc.status, gone]);
  } finally {
    // Bachi hui test files (sneaky upload wagaira) — har haal mein saaf
    await Promise.all(
      createdFileIds.map((id) => fetch(`https://api.imagekit.io/v1/files/${id}`, { method: "DELETE", headers: { Authorization: IK_AUTH } }).catch(() => {}))
    );
    for (const o of [A.outlet.id, B.outlet.id]) {
      await fetch("https://api.imagekit.io/v1/folder", {
        method: "DELETE",
        headers: { Authorization: IK_AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ folderPath: `/outlets/${o}` }),
      }).catch(() => {});
    }
    const outletIds = aDeleted ? [B.outlet.id] : [A.outlet.id, B.outlet.id];
    await prisma.auditLog.deleteMany({ where: { outletId: { in: outletIds } } });
    await prisma.orderItem.deleteMany({ where: { order: { outletId: { in: outletIds } } } });
    await prisma.organization.deleteMany({ where: { id: { in: aDeleted ? [B.org.id] : [A.org.id, B.org.id] } } });
    await prisma.$disconnect();
  }

  console.log(failures === 0 ? "\nAll photo checks passed ✅" : `\n${failures} check(s) FAILED ❌`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
