'use client';

// components/ProductPhoto.tsx
// ADDED (2026-10-18): ITEM PHOTO — lib/product-visual.tsx ke "photo slot" ka asli use.
// Cafe ne photo daali → asli photo (ImageKit se chhota version `?tr=w-…`), warna wahi purana artwork.
// Photo load fail ho (ImageKit Free plan ka mahine ka limit khatam / net) → chupchaap artwork pe
// wapas — menu kabhi toota hua (khaali dabba / broken icon) nahi dikhta.
// loading="lazy": photo tabhi aati hai jab customer scroll karke wahan pahunche — 4G + bandwidth bachta hai.
// CONNECTED TO: lib/product-visual.tsx (ProductArt), app/order/[slug]/page.tsx, ProductModal.tsx

import { useState } from 'react';
import { ProductArt } from '@/lib/product-visual';

export function ProductPhoto({
  name,
  imageUrl,
  px,
  iconSize,
  className = '',
}: {
  name: string;
  imageUrl?: string | null;
  /** Dikhne wala size (CSS px) — ImageKit isse 2x ka version bhejta hai */
  px: number;
  iconSize?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) return <ProductArt name={name} iconSize={iconSize} className={className} />;
  const w = Math.round(px * 2);
  const src = `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}tr=w-${w},h-${w}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="" // naam button/heading pehle hi bolta hai — screen reader do baar na bole
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 bg-line object-cover ${className}`}
    />
  );
}
