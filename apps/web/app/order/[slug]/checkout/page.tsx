'use client';

// app/order/[slug]/checkout/page.tsx
// USE CASE: Final confirmation before the order is created. Places the order via
// publicMenuApi.createOrder (reuses the same createOrder() the mobile Cashier
// uses, so this order shows up on the Chef's KDS in real time via the existing
// Socket.io emit). Payment is "Pay at Counter" only in this version — no
// gateway/card fields here by design.
// CONNECTED TO: lib/api.ts, lib/cart-store.ts. Redirects to ../status/[orderId].

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, AlertTriangle, Wallet } from 'lucide-react';
import { publicMenuApi, type OrderItemPayload } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const handlePlaceOrder = async () => {
    setError(null);
    setPlacing(true);
    try {
      const payload: OrderItemPayload[] = items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        addonIds: item.addonIds.length > 0 ? item.addonIds : undefined,
        quantity: item.quantity,
        notes: item.notes,
      }));

      const order = await publicMenuApi.createOrder(slug, { orderType: 'TAKEAWAY', items: payload });
      clearCart();
      router.replace(`/order/${slug}/status/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place your order. Please try again.');
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-muted">Your cart is empty.</p>
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
        <button onClick={() => router.push(`/order/${slug}/cart`)} className="text-ink" aria-label="Back to cart">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-bold text-ink">Confirm Order</h1>
      </header>

      <div className="px-5 pt-5">
        <p className="mb-2 text-sm font-semibold text-ink">
          {itemCount} item{itemCount > 1 ? 's' : ''}
        </p>
        <div className="divide-y divide-line rounded-2xl border border-line">
          {items.map((item) => (
            <div key={item.key} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-ink">
                {item.quantity} × {item.productName}
                {item.variantName ? ` (${item.variantName})` : ''}
              </span>
              <span className="font-semibold text-ink">₹{item.unitPrice * item.quantity}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted">Estimated total</span>
          <span className="text-base font-bold text-ink">₹{subtotal}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Final amount (with tax) will be confirmed on your order.</p>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-white p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-light">
            <Wallet className="h-4 w-4 text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">Pay at Counter</p>
            <p className="mt-0.5 text-xs text-muted">Settle by cash or UPI with staff when your order arrives.</p>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-white px-5 py-4">
        <button
          onClick={handlePlaceOrder}
          disabled={placing}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white active:bg-brand-dark disabled:opacity-60"
        >
          {placing ? 'Placing your order…' : `Place Order · ₹${subtotal}`}
        </button>
      </div>
    </main>
  );
}