// lib/cart-store.ts
// USE CASE: Client-side cart for the QR ordering flow. Persists to localStorage so
// a customer's cart survives an accidental page refresh while they're deciding.
// CONNECTED TO: order/[slug]/page.tsx, cart/page.tsx, status page.

//
// FIX (2026-09-29): cart ab CAFE-SPECIFIC hai. Pehle poori site ka ek hi cart
// tha (localStorage key 'billraw-cart') — customer Cafe A ka QR scan karke item
// daale, phir Cafe B ka QR scan kare, to Cafe A ke items Cafe B ke cart mein
// dikhte aur order "Product not found" se fail hota. Ab cart ke saath `outletSlug`
// store hota hai; doosre cafe ke page pe aate hi purana cart saaf.
//
// UI/UX PASS (2026-09-30):
//  - Har line ke saath `taxRate` — cart/checkout pe asli GST + total dikhta hai
//    (pehle tax dikhta hi nahi tha, counter pe bill zyada aata)
//  - `table`: per-table QR (?table=<id>) se aaya customer — order DINE_IN + table ke saath jaata hai
//  - `lastOrder`: order ke baad menu pe "Track order #12" link, tab band karke wapas aane pe bhi
//  - Quantity max 100 (backend limit)

import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Product, ProductVariant, ProductAddon } from './api';
import { round2 } from './money';

export const MAX_QTY = 100;

export interface CartLine {
  key: string;
  productId: string;
  productName: string;
  isVeg: boolean;
  variantId?: string;
  variantName?: string;
  addonIds: string[];
  addonNames: string[];
  unitPrice: number;
  taxRate: number;
  quantity: number;
  notes?: string;
}

export interface TableContext {
  id: string;
  tableNumber: string;
  /** Kab scan hua — 3 ghante baad context expire (menu page) */
  setAt: number;
}

export interface LastOrder {
  id: string;
  orderNumber: number;
  placedAt: number;
}

interface CartState {
  items: CartLine[];
  outletSlug: string | null;
  table: TableContext | null;
  lastOrder: LastOrder | null;
  bindToOutlet: (slug: string) => void;
  setTable: (table: TableContext | null) => void;
  setLastOrder: (order: LastOrder | null) => void;
  addItem: (product: Product, variant: ProductVariant | null, addons: ProductAddon[], quantity: number, notes?: string) => void;
  incrementItem: (key: string) => void;
  decrementItem: (key: string) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
}

function buildKey(productId: string, variantId?: string, addonIds: string[] = [], notes?: string) {
  // Alag note wale same item alag line hon ("less sugar" vs normal)
  return `${productId}|${variantId ?? 'base'}|${[...addonIds].sort().join(',')}|${notes ?? ''}`;
}

/** Bina variant/addon/note wale simple item ki key (menu ke +/- ke liye) */
export function simpleKey(productId: string) {
  return buildKey(productId);
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      outletSlug: null,
      table: null,
      lastOrder: null,
      bindToOutlet: (slug) =>
        set((state) =>
          state.outletSlug === slug ? state : { outletSlug: slug, items: [], table: null, lastOrder: null }
        ),
      setTable: (table) => set({ table }),
      setLastOrder: (lastOrder) => set({ lastOrder }),
      addItem: (product, variant, addons, quantity, notes) => {
        const addonIds = addons.map((a) => a.id);
        const key = buildKey(product.id, variant?.id, addonIds, notes);
        const unitPrice = round2((variant?.price ?? product.price) + addons.reduce((s, a) => s + a.price, 0));
        set((state) => {
          const existing = state.items.find((i) => i.key === key);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.key === key ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_QTY) } : i
              ),
            };
          }
          return {
            items: [
              ...state.items,
              {
                key,
                productId: product.id,
                productName: product.name,
                isVeg: product.isVeg,
                variantId: variant?.id,
                variantName: variant?.name,
                addonIds,
                addonNames: addons.map((a) => a.name),
                unitPrice,
                taxRate: product.taxRate ?? 0,
                quantity: Math.min(quantity, MAX_QTY),
                notes,
              },
            ],
          };
        });
      },
      incrementItem: (key) =>
        set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, quantity: Math.min(i.quantity + 1, MAX_QTY) } : i)) })),
      decrementItem: (key) =>
        set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0) })),
      removeItem: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: 'billraw-cart',
      // v2: lines mein taxRate/isVeg aaye — purane carts (bina taxRate) saaf, galat total na dikhe
      version: 2,
      migrate: () => ({ items: [], outletSlug: null, table: null, lastOrder: null }) as unknown as CartState,
    }
  )
);

/** USE CASE: har /order/[slug] page pe call karo — cart ko us cafe se bind karta hai */
export function useBindCartToOutlet(slug: string | undefined) {
  const bindToOutlet = useCartStore((s) => s.bindToOutlet);
  useEffect(() => {
    if (slug) bindToOutlet(slug);
  }, [slug, bindToOutlet]);
}
