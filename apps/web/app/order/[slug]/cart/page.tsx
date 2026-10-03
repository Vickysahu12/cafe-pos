'use client';

// app/order/[slug]/cart/page.tsx
// USE CASE: Customer ka review + place order — ab EK hi screen (pehle Cart → Checkout
// do alag screens thi, beech ki checkout screen pe kuch naya decide nahi hota tha; ek
// tap kam = kam log beech mein chhodte hain). /checkout ab yahin redirect karta hai.
//
// UI/UX PASS (2026-09-30):
//  - FIX: asli bill — Subtotal + GST = Total (backend jaisa hisaab). Pehle sirf subtotal
//    dikhta, counter pe zyada amount aata → customer ka trust tootta.
//  - FIX: order type — table QR se aaye to "Dine-in · Table 5" (DINE_IN + tableId jaata hai,
//    kitchen/cashier ko table pata chalti hai), warna "Takeaway — pick up at counter"
//  - FIX: fake text ("Chilled. Fizzy and refreshing." har item pe), misleading
//    "Secure payment" badge aur bouncing emoji hataye — pay at counter ka saaf message
//  - Double-tap se duplicate order nahi (button placing ke dauran disabled)
//  - Order ke baad lastOrder save → menu pe "Track order #N"
//
// REDESIGN (2026-10-02): landing jaisa espresso brand — order type espresso card, bill
// receipt jaisa (dashed line), floating "Place order" bar + spinner, compact steppers.

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, Armchair, Banknote, Loader2, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { publicMenuApi, type OrderItemPayload } from '@/lib/api';
import { useCartStore, useBindCartToOutlet } from '@/lib/cart-store';
import { billTotals, formatINR } from '@/lib/money';
import { ProductTile } from '@/lib/product-visual';
import { QtyStepper, StateScreen, VegMark } from '@/components/ui';

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  useBindCartToOutlet(slug); // FIX (2026-09-29): cart sirf isi cafe ka (dekho lib/cart-store.ts)
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const table = useCartStore((s) => s.table);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);
  const setLastOrder = useCartStore((s) => s.setLastOrder);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { subtotal, tax, total } = billTotals(items);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const menuHref = `/order/${slug}`;

  const handlePlaceOrder = async () => {
    if (placing) return;
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

      const order = await publicMenuApi.createOrder(slug, {
        orderType: table ? 'DINE_IN' : 'TAKEAWAY',
        tableId: table?.id,
        items: payload,
      });
      setLastOrder({ id: order.id, orderNumber: order.orderNumber, placedAt: Date.now() });
      clearCart();
      router.replace(`/order/${slug}/status/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place your order. Please try again.');
      setPlacing(false);
    }
  };

  if (items.length === 0 && !placing) {
    return (
      <StateScreen
        icon={ShoppingBag}
        title="Your cart is empty"
        message="Add something from the menu to get started."
        action={{ label: 'Browse menu', href: menuHref }}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-paper pb-36">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-2xl items-center gap-1 px-2 py-2">
          <Link
            href={menuHref}
            aria-label="Back to menu"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface"
          >
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-lg font-bold tracking-tight text-ink">Your order</h1>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        {/* Order type */}
        <div className="flex items-center gap-3.5 rounded-[20px] bg-brand p-4 text-white">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-roast-light">
            {table ? <Armchair size={21} aria-hidden="true" /> : <ShoppingBag size={21} aria-hidden="true" />}
          </span>
          <div>
            <p className="text-[15px] font-bold">{table ? `Dine-in · Table ${table.tableNumber}` : 'Takeaway'}</p>
            <p className="text-sm text-white/70">
              {table ? "We'll bring it to your table." : "We'll call your order number at the counter."}
            </p>
          </div>
        </div>

        {/* Items */}
        <section aria-labelledby="items-heading" className="rounded-[20px] border border-line bg-surface">
          <div className="flex items-center justify-between px-4 pb-1 pt-4">
            <h2 id="items-heading" className="text-[15px] font-bold text-ink">
              {itemCount} item{itemCount === 1 ? '' : 's'}
            </h2>
            <Link
              href={menuHref}
              className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-bold text-roast-ink transition-colors hover:bg-brand-soft"
            >
              <Plus size={16} aria-hidden="true" /> Add more
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {items.map((item) => {
              const details = [item.variantName, ...item.addonNames].filter(Boolean).join(' · ');
              return (
                <li key={item.key} className="flex gap-3.5 p-4">
                  <ProductTile name={item.productName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <VegMark isVeg={item.isVeg} className="mt-0.75" />
                      <p className="text-[15px] font-semibold leading-snug text-ink">{item.productName}</p>
                    </div>
                    {details && <p className="mt-0.5 text-sm text-muted">{details}</p>}
                    {item.notes && <p className="mt-0.5 text-sm italic text-muted">“{item.notes}”</p>}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <QtyStepper
                        size="sm"
                        quantity={item.quantity}
                        label={item.productName}
                        variant="soft"
                        onDecrement={() => decrementItem(item.key)}
                        onIncrement={() => incrementItem(item.key)}
                      />
                      <div className="flex items-center gap-1">
                        <span className="tabular text-[15px] font-semibold text-ink">{formatINR(item.unitPrice * item.quantity)}</span>
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          aria-label={`Remove ${item.productName}`}
                          className="flex h-10 w-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Bill — receipt jaisa */}
        <section aria-labelledby="bill-heading" className="rounded-[20px] border border-line bg-surface p-4">
          <h2 id="bill-heading" className="mb-3 text-[15px] font-bold text-ink">
            Bill details
          </h2>
          <dl className="tabular space-y-2.5 text-[15px]">
            <div className="flex justify-between text-muted">
              <dt>Item total</dt>
              <dd className="text-ink">{formatINR(subtotal)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>GST</dt>
              <dd className="text-ink">{formatINR(tax)}</dd>
            </div>
            <div className="flex justify-between border-t border-dashed border-line-strong pt-3 text-base font-bold text-ink">
              <dt>To pay</dt>
              <dd>{formatINR(total)}</dd>
            </div>
          </dl>
        </section>

        {/* Payment */}
        <div className="flex items-start gap-3.5 rounded-[20px] border border-line bg-surface p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-roast-ink">
            <Banknote size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-[15px] font-bold text-ink">Pay at the counter</p>
            <p className="text-sm text-muted">Cash or UPI. No payment is taken online.</p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex animate-rise items-start gap-2 rounded-[20px] border border-danger/20 bg-danger-soft p-4 text-sm font-semibold text-danger"
          >
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Place order */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={placing}
          className="pointer-events-auto mx-auto flex h-16 w-full max-w-2xl items-center justify-between rounded-[20px] bg-brand px-5 text-white shadow-[0_18px_40px_-12px_rgb(43_31_20/0.65)] transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.99] disabled:opacity-80"
        >
          <span className="text-left">
            <span className="tabular block text-base font-bold">{formatINR(total)}</span>
            <span className="block text-xs text-white/65">Total incl. GST</span>
          </span>
          <span className="flex items-center gap-2 text-[15px] font-bold">
            {placing ? (
              <>
                <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Placing order…
              </>
            ) : (
              <>
                Place order <ArrowRight size={18} aria-hidden="true" />
              </>
            )}
          </span>
        </button>
      </div>
    </main>
  );
}
