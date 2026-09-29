// lib/cart-store.ts
// USE CASE: Client-side cart for the QR ordering flow. Persists to localStorage so
// a customer's cart survives an accidental page refresh while they're deciding.
// CONNECTED TO: order/[slug]/page.tsx, cart/page.tsx, checkout/page.tsx.

//
// FIX (2026-09-29): cart ab CAFE-SPECIFIC hai. Pehle poori site ka ek hi cart
// tha (localStorage key 'billraw-cart') — customer Cafe A ka QR scan karke item
// daale, phir Cafe B ka QR scan kare, to Cafe A ke items Cafe B ke cart mein
// dikhte aur order "Product not found" se fail hota. Ab cart ke saath `outletSlug`
// store hota hai; doosre cafe ke page pe aate hi purana cart saaf.

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, ProductVariant, ProductAddon } from './api';

export interface CartLine {
  key: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  addonIds: string[];
  addonNames: string[];
  unitPrice: number;
  quantity: number;
  notes?: string;
}

interface CartState {
  items: CartLine[];
  outletSlug: string | null;
  bindToOutlet: (slug: string) => void;
  addItem: (product: Product, variant: ProductVariant | null, addons: ProductAddon[], quantity: number, notes?: string) => void;
  incrementItem: (key: string) => void;
  decrementItem: (key: string) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
}

function buildKey(productId: string, variantId?: string, addonIds: string[] = []) {
  return `${productId}|${variantId ?? 'base'}|${[...addonIds].sort().join(',')}`;
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      outletSlug: null,
      bindToOutlet: (slug) =>
        set((state) => (state.outletSlug === slug ? state : { outletSlug: slug, items: [] })),
      addItem: (product, variant, addons, quantity, notes) => {
        const addonIds = addons.map((a) => a.id);
        const key = buildKey(product.id, variant?.id, addonIds);
        const unitPrice = (variant?.price ?? product.price) + addons.reduce((s, a) => s + a.price, 0);
        set((state) => {
          const existing = state.items.find((i) => i.key === key);
          if (existing) {
            return { items: state.items.map((i) => (i.key === key ? { ...i, quantity: i.quantity + quantity } : i)) };
          }
          return {
            items: [
              ...state.items,
              { key, productId: product.id, productName: product.name, variantId: variant?.id, variantName: variant?.name, addonIds, addonNames: addons.map((a) => a.name), unitPrice, quantity, notes },
            ],
          };
        });
      },
      incrementItem: (key) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, quantity: i.quantity + 1 } : i)) })),
      decrementItem: (key) => set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0) })),
      removeItem: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clearCart: () => set({ items: [] }),
    }),
    { name: 'billraw-cart' }
  )
);

/** USE CASE: har /order/[slug] page pe call karo — cart ko us cafe se bind karta hai */
export function useBindCartToOutlet(slug: string | undefined) {
  const bindToOutlet = useCartStore((s) => s.bindToOutlet);
  useEffect(() => {
    if (slug) bindToOutlet(slug);
  }, [slug, bindToOutlet]);
}