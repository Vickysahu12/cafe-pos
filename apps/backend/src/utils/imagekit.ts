/**
 * IMAGEKIT (item photos)
 * ─────────────────────────────────────────────────────────
 * ADDED (2026-10-18)
 *
 * USE CASE: Menu item ki photo. App photo ko phone pe hi chhota (~800px, ~100KB) karke SEEDHA
 * ImageKit pe upload karta hai — hamara server photo ka bojh nahi uthata. Server sirf:
 *   1. ek baar ka upload signature deta hai (private key kabhi app mein nahi jaati)
 *   2. upload ke baad ImageKit se file ki details mangwa ke CHECK karta hai — image hai, chhoti hai,
 *      aur ISI cafe ke folder mein hai — tabhi item pe lagata hai (koi doosre cafe ki / random file
 *      ka fileId bhej ke apne menu pe nahi laga sakta)
 *   3. purani/hatai photo + account delete pe poora folder ImageKit se delete
 *
 * Keys sirf env mein (IMAGEKIT_*). Na ho to feature band (503, saaf message) — server phir bhi chale.
 * Account: "billraw" (Mumbai region) — Free plan 20GB/month bandwidth; customer website pe chhote
 * thumbnails (?tr=w-…) jaate hain taaki bandwidth kam lage.
 *
 * CONNECTED TO: menu.service.ts (photo set/remove/delete), auth.service.ts (account delete),
 *               config/env.ts
 */

import crypto from "crypto";
import { env } from "../config/env";
import { logger } from "../config/logger";

const API = "https://api.imagekit.io/v1";
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // app ~100KB bhejta hai; 2MB upar = kuch gadbad

function httpError(message: string, statusCode: number, code?: string): never {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  if (code) err.code = code;
  err.expose = true; // 5xx bhi user ko dikhe (message safe hai)
  throw err;
}

export function isImageKitConfigured() {
  return !!(env.IMAGEKIT_PRIVATE_KEY && env.IMAGEKIT_PUBLIC_KEY && env.IMAGEKIT_URL_ENDPOINT);
}

function assertConfigured() {
  if (!isImageKitConfigured()) httpError("Photos aren't set up on the server yet. Please try later.", 503, "PHOTOS_DISABLED");
}

const authHeader = () => "Basic " + Buffer.from(`${env.IMAGEKIT_PRIVATE_KEY}:`).toString("base64");

/** Har cafe ka apna folder — verify yahi prefix check karta hai */
export const outletPhotoFolder = (outletId: string) => `/outlets/${outletId}/products`;

/** Ek baar ka upload signature (ImageKit client-side upload). 10 min valid, token dobara use nahi hota. */
export function createUploadAuth(outletId: string) {
  assertConfigured();
  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 10 * 60;
  const signature = crypto.createHmac("sha1", env.IMAGEKIT_PRIVATE_KEY!).update(token + expire).digest("hex");
  return {
    token,
    expire,
    signature,
    publicKey: env.IMAGEKIT_PUBLIC_KEY!,
    folder: outletPhotoFolder(outletId),
    uploadUrl: "https://upload.imagekit.io/api/v1/files/upload",
  };
}

export interface ImageKitFile {
  fileId: string;
  filePath: string;
  url: string;
  fileType: string;
  size: number;
}

/** Upload hua file sach mein hai? Galat/purana id → null */
export async function getFileDetails(fileId: string): Promise<ImageKitFile | null> {
  assertConfigured();
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(fileId)) return null;
  let res: Response;
  try {
    res = await fetch(`${API}/files/${encodeURIComponent(fileId)}/details`, {
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    httpError("Couldn't reach the photo service. Please try again.", 502, "PHOTO_SERVICE_DOWN");
  }
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) httpError("Couldn't check the photo. Please try again.", 502, "PHOTO_SERVICE_DOWN");
  return (await res.json()) as ImageKitFile;
}

/** Best-effort delete — fail ho to sirf log (photo ka extra copy bas storage mein rahega) */
export async function deleteFile(fileId: string | null | undefined) {
  if (!fileId || !isImageKitConfigured()) return;
  try {
    const res = await fetch(`${API}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok && res.status !== 404) logger.warn(`ImageKit delete ${fileId} failed: HTTP ${res.status}`);
  } catch (err) {
    logger.warn(`ImageKit delete ${fileId} failed`, { err: String(err) });
  }
}

/** Account delete: cafe ka poora folder (best-effort) */
export async function deleteOutletPhotos(outletId: string) {
  if (!isImageKitConfigured()) return;
  try {
    const res = await fetch(`${API}/folder`, {
      method: "DELETE",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath: `/outlets/${outletId}` }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok && res.status !== 404) logger.warn(`ImageKit folder delete ${outletId} failed: HTTP ${res.status}`);
  } catch (err) {
    logger.warn(`ImageKit folder delete ${outletId} failed`, { err: String(err) });
  }
}
