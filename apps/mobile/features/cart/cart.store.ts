// features/cart/cart.store.ts
// USE CASE: Local cart state for the Cashier's in-progress order — lives only on
//           device until checkout, never touches the backend until the order is placed.
//           Handles adding items (with variant/addon selection), quantity changes, and
//           computing the running total using the SAME price-selection logic the backend
//           uses (variant price if selected, base price otherwise, + addon prices) —
//           this is purely for display; the backend independently recalculates and is
//           the source of truth for the actual charge.
// CONNECTED TO: (cashier)/billing.tsx, VariantAddonModal, (cashier)/cart.tsx, checkout.tsx

import { create } from 'zustand';
import { Product, ProductVariant, ProductAddon } from '../menu/menu.api';

export interface CartLineItem {
  key: string; // unique per product+variant+addon combo, so different variants of the same product are separate lines
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  addonIds: string[];
  addonNames: string[];
  unitPrice: number; // variant price (or base price) + sum of addon prices
  quantity: number;
  notes?: string;
  // FIX (2026-09-30): har product ka apna GST %. Pehle billing/cart/checkout sab
  // pe flat "Tax (5%)" dikhta tha — 0% ya 18% wale items pe screen ka total asli
  // bill se alag aata tha (cashier customer ko galat amount bolta).
  taxRate: number;
}

// Backend (orders.service.ts + utils/money.ts) jaisa hi paisa rounding — screen
// aur bill ka total hamesha match kare
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// Backend OrderItemSchema ki max limit — isse zyada pe order fail hota
export const MAX_ITEM_QUANTITY = 100;

interface CartState {
  items: CartLineItem[];
  tableId: string | null;
  tableNumber: string | null;
  orderType: 'DINE_IN' | 'TAKEAWAY';

  addItem: (product: Product, variant: ProductVariant | null, addons: ProductAddon[], quantity: number, notes?: string) => void;
  incrementItem: (key: string) => void;
  decrementItem: (key: string) => void;
  removeItem: (key: string) => void;
  setTable: (tableId: string | null, tableNumber: string | null) => void;
  setOrderType: (type: 'DINE_IN' | 'TAKEAWAY') => void;
  clearCart: () => void;

  totalItems: () => number;
  subtotal: () => number;
  /** FIX (2026-09-30): per-item GST, backend jaisa hi calculation */
  taxTotal: () => number;
  /** subtotal + tax — yahi bill ka final amount hai (discount se pehle) */
  grandTotal: () => number;
}

function buildKey(productId: string, variantId?: string, addonIds: string[] = []) {
  return `${productId}|${variantId ?? 'base'}|${[...addonIds].sort().join(',')}`;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  tableId: null,
  tableNumber: null,
  orderType: 'TAKEAWAY',

  addItem: (product, variant, addons, quantity, notes) => {
    const addonIds = addons.map((a) => a.id);
    const key = buildKey(product.id, variant?.id, addonIds);
    const unitPrice = round2((variant?.price ?? product.price) + addons.reduce((sum, a) => sum + a.price, 0));

    set((state) => {
      const existing = state.items.find((i) => i.key === key);
      if (existing) {
        // Same product+variant+addon combo already in cart — just bump quantity
        return {
          items: state.items.map((i) =>
            i.key === key ? { ...i, quantity: Math.min(i.quantity + quantity, MAX_ITEM_QUANTITY) } : i
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
            variantId: variant?.id,
            variantName: variant?.name,
            addonIds,
            addonNames: addons.map((a) => a.name),
            unitPrice,
            quantity: Math.min(quantity, MAX_ITEM_QUANTITY),
            notes,
            taxRate: product.taxRate ?? 0,
          },
        ],
      };
    });
  },

  incrementItem: (key) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.key === key ? { ...i, quantity: Math.min(i.quantity + 1, MAX_ITEM_QUANTITY) } : i
      ),
    })),

  decrementItem: (key) =>
    set((state) => ({
      items: state.items
        .map((i) => (i.key === key ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0), // auto-remove if it hits zero
    })),

  removeItem: (key) => set((state) => ({ items: state.items.filter((i) => i.key !== key) })),

  setTable: (tableId, tableNumber) => set({ tableId, tableNumber, orderType: tableId ? 'DINE_IN' : 'TAKEAWAY' }),

  setOrderType: (type) => set({ orderType: type, ...(type === 'TAKEAWAY' ? { tableId: null, tableNumber: null } : {}) }),

  clearCart: () => set({ items: [], tableId: null, tableNumber: null, orderType: 'TAKEAWAY' }),

  totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
  subtotal: () => get().items.reduce((sum, i) => round2(sum + round2(i.unitPrice * i.quantity)), 0),
  // Backend jaisa: har line ka tax alag round, phir jod
  taxTotal: () =>
    get().items.reduce((sum, i) => round2(sum + round2(round2(i.unitPrice * i.quantity) * ((i.taxRate ?? 0) / 100))), 0),
  grandTotal: () => round2(get().subtotal() + get().taxTotal()),
}));