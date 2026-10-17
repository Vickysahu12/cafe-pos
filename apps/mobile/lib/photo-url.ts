// lib/photo-url.ts
// ADDED (2026-10-18): ImageKit se chhota version mangwao (`?tr=w-…,h-…`) — 800px ki photo list ke
// 48px dabbe mein bhejna bandwidth ki barbaadi hai (Free plan 20GB/month).
// CONNECTED TO: components/menu/ProductPhoto.tsx, app/(admin)/menu/[categoryId]/products.tsx

export function photoThumb(url: string, size: number): string {
  const px = Math.round(size * 2); // phone screens 2-3x density — 2x kaafi saaf
  return `${url}${url.includes('?') ? '&' : '?'}tr=w-${px},h-${px}`;
}
