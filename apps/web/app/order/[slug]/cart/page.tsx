'use client';

// app/order/[slug]/cart/page.tsx
// USE CASE: Cart review before checkout — adjust quantities, remove items, see an
// estimated total. Tax is computed authoritatively by the backend at order
// creation, so this total is labelled "estimated."
// CONNECTED TO: lib/cart-store.ts.

import { useParams, useRouter } from 'next/navigation';
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from 'lucide-react';
import { useCartStore } from '@/lib/cart-store';

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  if (items.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-light">
          <ShoppingBag className="h-6 w-6 text-brand" />
        </div>
        <h1 className="text-base font-semibold text-ink">Your cart is empty</h1>
        <p className="mt-1 text-sm text-muted">Add something from the menu to get started.</p>
        <button
          onClick={() => router.push(`/order/${slug}`)}
          className="mt-4 rounded-full bg-brand px-6 py-2 text-sm font-semibold text-white active:bg-brand-dark"
        >
          Browse Menu
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-32">
      <header className="flex items-center gap-3 border-b border-line bg-white px-5 py-4">
        <button onClick={() => router.push(`/order/${slug}`)} className="text-ink" aria-label="Back to menu">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold text-ink">Your Order</h1>
      </header>

      <div className="divide-y divide-line px-5">
        {items.map((item) => {
          const subtitleParts = [item.variantName, ...item.addonNames].filter(Boolean);
          return (
            <div key={item.key} className="flex items-start justify-between gap-4 py-4">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-ink">{item.productName}</h3>
                {subtitleParts.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted">{subtitleParts.join(' · ')}</p>
                )}
                {item.notes && <p className="mt-1 text-xs italic text-muted">&ldquo;{item.notes}&rdquo;</p>}
                <p className="mt-2 text-sm font-semibold text-ink">₹{item.unitPrice * item.quantity}</p>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                <button onClick={() => removeItem(item.key)} className="text-muted" aria-label="Remove item">
                  <Trash2 size={16} />
                </button>
                <div className="flex items-center gap-3 rounded-full border border-brand bg-brand-light px-2 py-1">
                  <button onClick={() => decrementItem(item.key)} className="text-brand" aria-label="Decrease quantity">
                    <Minus size={14} />
                  </button>
                  <span className="w-4 text-center text-sm font-semibold text-brand">{item.quantity}</span>
                  <button onClick={() => incrementItem(item.key)} className="text-brand" aria-label="Increase quantity">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white px-5 py-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-muted">Estimated total</span>
          <span className="font-bold text-ink">₹{subtotal}</span>
        </div>
        <p className="mb-3 text-xs text-muted">Taxes calculated at checkout.</p>
        <button
          onClick={() => router.push(`/order/${slug}/checkout`)}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white active:bg-brand-dark"
        >
          Proceed to Checkout
        </button>
      </div>
    </main>
  );
}