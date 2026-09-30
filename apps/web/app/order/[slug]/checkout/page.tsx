'use client';

// app/order/[slug]/checkout/page.tsx
// UI/UX PASS (2026-09-30): Checkout ab Cart page mein merge ho gaya (ek screen, ek tap kam).
// Yeh route sirf purane links/bookmarks ke liye — seedha cart pe bhej deta hai.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function CheckoutRedirect() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/order/${slug}/cart`);
  }, [router, slug]);
  return null;
}
