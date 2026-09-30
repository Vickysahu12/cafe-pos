'use client';

// app/order/[slug]/status/[orderId]/page.tsx
// USE CASE: Order ke baad customer yahan live status dekhta hai (har 5 sec poll).
//
// UI/UX PASS (2026-09-30):
//  - FIX: har item ke saath "1 × ₹<POORE ORDER KA TOTAL>" dikhta tha — ab har item ka
//    apna price (backend ab item totalPrice + tax bhejta hai) aur neeche sahi bill
//  - FIX: fake text ("Chilled. Fizzy and refreshing."), fake "N Order Tracking" footer,
//    bouncing emojis hataye
//  - Har stage ka saaf message + progress, Paid/Unpaid badge, table/takeaway info
//  - Tab background mein ho to polling ruk jaati hai (battery/data), wapas aate hi turant refresh
//  - Pehle load ke baad network jaye to page gayab nahi — "Reconnecting…" chhota note
//  - SERVED/CANCELLED pe polling band + menu pe "Track order" banner hat jaata hai

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, ChefHat, CircleCheckBig, Clock3, ReceiptText, WifiOff, XCircle } from 'lucide-react';
import { publicMenuApi, type OrderStatus, type PublicOrderStatus } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { formatINR } from '@/lib/money';
import { ProductTile } from '@/lib/product-visual';
import { PoweredBy, StateScreen, VegMark } from '@/components/ui';

const POLL_MS = 5000;
const TERMINAL: OrderStatus[] = ['SERVED', 'CANCELLED'];

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'PENDING', label: 'Placed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
];

function headline(order: PublicOrderStatus): { title: string; message: string; Icon: typeof Clock3 } {
  const atTable = !!order.table;
  switch (order.orderStatus) {
    case 'PENDING':
      return { title: 'Order received', message: 'The kitchen will start on it shortly.', Icon: Clock3 };
    case 'PREPARING':
      return { title: 'Being prepared', message: 'The kitchen is working on your order.', Icon: ChefHat };
    case 'READY':
      return atTable
        ? { title: 'Ready!', message: 'Your order is on its way to your table.', Icon: CircleCheckBig }
        : { title: 'Ready for pickup', message: `Collect order #${order.orderNumber} at the counter.`, Icon: CircleCheckBig };
    default:
      return { title: 'Enjoy your meal!', message: 'Thanks for ordering with us.', Icon: CircleCheckBig };
  }
}

const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Queued', cls: 'bg-paper text-muted' },
  PREPARING: { label: 'Preparing', cls: 'bg-amber-50 text-amber-800' },
  READY: { label: 'Ready', cls: 'bg-success-soft text-success' },
};

export default function OrderStatusPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const lastOrder = useCartStore((s) => s.lastOrder);
  const setLastOrder = useCartStore((s) => s.setLastOrder);

  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const doneRef = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await publicMenuApi.getOrderStatus(slug, orderId);
      setOrder(data);
      setOffline(false);
      setLoadError(null);
      if (TERMINAL.includes(data.orderStatus)) doneRef.current = true;
    } catch (err) {
      setOffline(true);
      setLoadError(err instanceof Error ? err.message : null);
    }
  }, [slug, orderId]);

  useEffect(() => {
    // Page khulte hi status fetch — data-fetching effect (intentional)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
    const tick = () => {
      if (!doneRef.current && document.visibilityState === 'visible') fetchStatus();
    };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchStatus]);

  // Order khatam — menu pe "Track order" banner hatao
  useEffect(() => {
    if (order && TERMINAL.includes(order.orderStatus) && lastOrder?.id === order.id) setLastOrder(null);
  }, [order, lastOrder, setLastOrder]);

  const menuHref = `/order/${slug}`;

  if (!order) {
    if (loadError) {
      return (
        <StateScreen
          icon={AlertTriangle}
          tone="danger"
          title="Couldn't load your order"
          message={`${loadError} We'll keep trying.`}
          action={{ label: 'Back to menu', href: menuHref }}
        />
      );
    }
    return <StatusSkeleton />;
  }

  if (order.orderStatus === 'CANCELLED') {
    return (
      <StateScreen
        icon={XCircle}
        tone="danger"
        title={`Order #${order.orderNumber} was cancelled`}
        message={order.paymentStatus === 'REFUNDED' ? 'Your payment will be returned at the counter.' : 'Please check with the staff at the counter.'}
        action={{ label: 'Back to menu', href: menuHref }}
      />
    );
  }

  const { title, message, Icon } = headline(order);
  const currentIndex = Math.max(0, STEPS.findIndex((s) => s.key === order.orderStatus));
  const isPaid = order.paymentStatus === 'PAID';

  return (
    <main className="min-h-dvh bg-paper pb-10">
      <div className="mx-auto max-w-2xl px-4 pt-6">
        {/* Status hero */}
        <section className="rounded-3xl bg-brand px-5 pb-6 pt-5 text-white" aria-live="polite">
          <div className="flex items-center justify-between text-sm text-white/80">
            <span className="font-semibold">Order #{order.orderNumber}</span>
            <span>{order.table ? `Table ${order.table.tableNumber}` : 'Takeaway'}</span>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <Icon size={26} aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
              <p className="text-[15px] text-white/85">{message}</p>
            </div>
          </div>

          {/* Progress */}
          <ol className="mt-6 grid grid-cols-4 gap-2" aria-label="Order progress">
            {STEPS.map((step, i) => {
              const done = i <= currentIndex;
              return (
                <li key={step.key} className="flex flex-col gap-2">
                  <span className={`h-1.5 rounded-full ${done ? 'bg-white' : 'bg-white/25'}`} />
                  <span className={`flex items-center gap-1 text-xs font-semibold ${done ? 'text-white' : 'text-white/60'}`}>
                    {done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {offline && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted" role="status">
            <WifiOff size={14} aria-hidden="true" /> Reconnecting… showing the last update
          </p>
        )}

        {/* Items */}
        <section aria-labelledby="st-items" className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          <h2 id="st-items" className="px-4 pb-1 pt-4 text-[15px] font-extrabold text-ink">
            Items
          </h2>
          <ul className="divide-y divide-line">
            {order.items.map((item) => {
              const s = ITEM_STATUS[item.status] ?? ITEM_STATUS.PENDING;
              return (
                <li key={item.id} className="flex items-center gap-3 p-4">
                  <ProductTile name={item.product.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <VegMark isVeg={item.product.isVeg} className="mt-0.75" />
                      <p className="text-[15px] font-bold leading-snug text-ink">
                        {item.product.name} <span className="font-medium text-muted">× {item.quantity}</span>
                      </p>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{formatINR(item.totalPrice)}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Bill */}
        <section aria-labelledby="st-bill" className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="st-bill" className="flex items-center gap-2 text-[15px] font-extrabold text-ink">
              <ReceiptText size={18} aria-hidden="true" /> Bill
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${isPaid ? 'bg-success-soft text-success' : 'bg-amber-50 text-amber-800'}`}
            >
              {isPaid ? 'Paid' : 'Pay at counter'}
            </span>
          </div>
          <dl className="space-y-2 text-[15px]">
            <div className="flex justify-between text-muted">
              <dt>Item total</dt>
              <dd className="text-ink">{formatINR(order.totalAmount)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>GST</dt>
              <dd className="text-ink">{formatINR(order.taxAmount)}</dd>
            </div>
            {order.discountAmount > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd>−{formatINR(order.discountAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-extrabold text-ink">
              <dt>{isPaid ? 'Paid' : 'To pay'}</dt>
              <dd>{formatINR(order.netAmount)}</dd>
            </div>
          </dl>
          {!isPaid && <p className="mt-3 text-sm text-muted">Pay by cash or UPI at the counter. Show order #{order.orderNumber}.</p>}
        </section>

        <Link
          href={menuHref}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-2xl border border-brand bg-surface text-[15px] font-bold text-brand transition-colors hover:bg-brand-soft"
        >
          Order something else
        </Link>

        <PoweredBy />
      </div>
    </main>
  );
}

function StatusSkeleton() {
  return (
    <main className="min-h-dvh bg-paper" aria-busy="true" aria-label="Loading your order">
      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-6">
        <div className="h-48 animate-pulse rounded-3xl bg-brand/20" />
        <div className="h-40 animate-pulse rounded-2xl bg-line" />
        <div className="h-32 animate-pulse rounded-2xl bg-line/70" />
      </div>
    </main>
  );
}
