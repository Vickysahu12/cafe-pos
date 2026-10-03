'use client';

// app/order/[slug]/status/[orderId]/page.tsx
// USE CASE: Order ke baad customer yahan live status dekhta hai (har 5 sec poll).
//
// UI/UX PASS (2026-09-30):
//  - FIX: har item ke saath "1 × ₹<POORE ORDER KA TOTAL>" dikhta tha — ab har item ka
//    apna price (backend ab item totalPrice + tax bhejta hai) aur neeche sahi bill
//  - FIX: fake text, fake "N Order Tracking" footer, bouncing emojis hataye
//  - Tab background mein ho to polling ruk jaati hai (battery/data), wapas aate hi turant refresh
//  - Pehle load ke baad network jaye to page gayab nahi — "Reconnecting…" chhota note
//  - SERVED/CANCELLED pe polling band + menu pe "Track order" banner hat jaata hai
//
// REDESIGN (2026-10-02) — inspo jaisa "live tracking" feel, landing ka espresso brand:
//  - Espresso hero: bada status + chalti hui progress bar (current step pe roshni chalti
//    hai = "kaam ho raha hai"), "Placed 3:06 PM · Updated 3:12 PM"
//  - Vertical TIMELINE: Placed → Preparing → Ready → Served, har step ka matlab likha
//    (table pe "On its way to your table", takeaway pe "Collect at the counter")
//  - JAAN-BOOJH KE NAHI: "18 min left" countdown — prep time pata nahi, fake ETA se
//    customer counter pe aakar ladta hai. Sirf asli times (backend createdAt/updatedAt).

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
const STEP_KEYS: OrderStatus[] = ['PENDING', 'PREPARING', 'READY', 'SERVED'];

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

/** Timeline ke har step ka naam + ek line matlab (table vs takeaway alag) */
function stepCopy(key: OrderStatus, atTable: boolean): { label: string; detail: string } {
  switch (key) {
    case 'PENDING':
      return { label: 'Order placed', detail: 'Sent to the kitchen' };
    case 'PREPARING':
      return { label: 'Preparing', detail: 'Your food is being made' };
    case 'READY':
      return atTable
        ? { label: 'Ready', detail: 'On its way to your table' }
        : { label: 'Ready', detail: 'Collect it at the counter' };
    default:
      return atTable ? { label: 'Served', detail: 'Enjoy your meal' } : { label: 'Picked up', detail: 'Enjoy your meal' };
  }
}

const ITEM_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Queued', cls: 'bg-paper text-muted' },
  PREPARING: { label: 'Preparing', cls: 'bg-warn-soft text-warn-ink' },
  READY: { label: 'Ready', cls: 'bg-success-soft text-success' },
};

const timeOf = (iso?: string) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : null;

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
  const currentIndex = Math.max(0, STEP_KEYS.indexOf(order.orderStatus));
  const finished = order.orderStatus === 'SERVED';
  const isPaid = order.paymentStatus === 'PAID';
  const atTable = !!order.table;
  const placedAt = timeOf(order.createdAt);
  const updatedAt = timeOf(order.updatedAt);

  return (
    <main className="min-h-dvh bg-paper pb-10">
      <div className="mx-auto max-w-2xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {/* ── Status hero ── */}
        <section
          className="animate-rise overflow-hidden rounded-[28px] px-5 pb-6 pt-5 text-white"
          style={{
            background:
              'radial-gradient(90% 80% at 100% 0%, rgb(192 138 46 / 0.30) 0%, rgb(192 138 46 / 0) 60%), var(--color-brand)',
          }}
          aria-live="polite"
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-white/80">Order #{order.orderNumber}</span>
            <span className="rounded-full bg-white/10 px-3 py-1 font-semibold ring-1 ring-white/15">
              {atTable ? `Table ${order.table!.tableNumber}` : 'Takeaway'}
            </span>
          </div>

          <div className="mt-6 flex items-center gap-4">
            <span
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-roast-light text-brand ${finished ? '' : 'animate-ring'}`}
            >
              <Icon size={28} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
              <p className="mt-0.5 text-[15px] text-white/75">{message}</p>
            </div>
          </div>

          {/* Progress — current step pe chalti roshni */}
          <div className="mt-6 grid grid-cols-4 gap-1.5" aria-hidden="true">
            {STEP_KEYS.map((key, i) => {
              const done = i < currentIndex || finished;
              const current = i === currentIndex && !finished;
              return (
                <span key={key} className="relative h-1.5 overflow-hidden rounded-full bg-white/15">
                  {done && <span className="absolute inset-0 rounded-full bg-roast-light" />}
                  {current && (
                    <span className="absolute inset-y-0 left-0 w-2/5 animate-progress rounded-full bg-roast-light" />
                  )}
                </span>
              );
            })}
          </div>
          <p className="tabular mt-3 text-xs text-white/60">
            Placed {placedAt}
            {updatedAt && updatedAt !== placedAt && ` · Updated ${updatedAt}`}
          </p>
        </section>

        {offline && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-muted" role="status">
            <WifiOff size={14} aria-hidden="true" /> Reconnecting… showing the last update
          </p>
        )}

        {/* ── Timeline ── */}
        <section aria-labelledby="st-progress" className="mt-3 rounded-[20px] border border-line bg-surface px-4 py-5">
          <h2 id="st-progress" className="sr-only">
            Order progress
          </h2>
          <ol>
            {STEP_KEYS.map((key, i) => {
              const done = i < currentIndex || finished;
              const current = i === currentIndex && !finished;
              const last = i === STEP_KEYS.length - 1;
              const { label, detail } = stepCopy(key, atTable);
              return (
                <li key={key} className="flex gap-3.5" aria-current={current ? 'step' : undefined}>
                  <div className="flex flex-col items-center">
                    {done ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">
                        <Check size={15} strokeWidth={3} aria-hidden="true" />
                      </span>
                    ) : current ? (
                      <span className="flex h-7 w-7 animate-ring items-center justify-center rounded-full bg-roast">
                        <span className="h-2.5 w-2.5 rounded-full bg-white" />
                      </span>
                    ) : (
                      <span className="h-7 w-7 rounded-full border-2 border-line-strong bg-surface" />
                    )}
                    {!last && <span className={`my-1 w-0.5 flex-1 rounded-full ${done ? 'bg-brand' : 'bg-line'}`} />}
                  </div>
                  <div className={`min-w-0 flex-1 ${last ? '' : 'pb-6'}`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className={`text-[15px] font-semibold ${done || current ? 'text-ink' : 'text-muted'}`}>{label}</p>
                      {i === 0 && placedAt && <span className="tabular text-xs text-muted">{placedAt}</span>}
                      {current && <span className="text-xs font-bold text-roast-ink">Now</span>}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ── Items ── */}
        <section aria-labelledby="st-items" className="mt-3 rounded-[20px] border border-line bg-surface">
          <h2 id="st-items" className="px-4 pb-1 pt-4 text-[15px] font-bold text-ink">
            Items
          </h2>
          <ul className="divide-y divide-line">
            {order.items.map((item) => {
              const s = ITEM_STATUS[item.status] ?? ITEM_STATUS.PENDING;
              return (
                <li key={item.id} className="flex items-center gap-3.5 p-4">
                  <ProductTile name={item.product.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <VegMark isVeg={item.product.isVeg} className="mt-0.75" />
                      <p className="text-[15px] font-semibold leading-snug text-ink">
                        {item.product.name} <span className="font-normal text-muted">× {item.quantity}</span>
                      </p>
                    </div>
                    <p className="tabular mt-0.5 text-sm text-muted">{formatINR(item.totalPrice)}</p>
                  </div>
                  {!finished && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>}
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Bill ── */}
        <section aria-labelledby="st-bill" className="mt-3 rounded-[20px] border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="st-bill" className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <ReceiptText size={18} aria-hidden="true" /> Bill
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${isPaid ? 'bg-success-soft text-success' : 'bg-warn-soft text-warn-ink'}`}
            >
              {isPaid ? 'Paid' : 'Pay at counter'}
            </span>
          </div>
          <dl className="tabular space-y-2.5 text-[15px]">
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
            <div className="flex justify-between border-t border-dashed border-line-strong pt-3 text-base font-bold text-ink">
              <dt>{isPaid ? 'Paid' : 'To pay'}</dt>
              <dd>{formatINR(order.netAmount)}</dd>
            </div>
          </dl>
          {!isPaid && <p className="mt-3 text-sm text-muted">Pay by cash or UPI at the counter. Show order #{order.orderNumber}.</p>}
        </section>

        <Link
          href={menuHref}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-full border border-line-strong bg-surface text-[15px] font-bold text-ink transition-[transform,background-color] hover:bg-brand-soft active:scale-[0.99]"
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
      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        <div className="h-56 animate-pulse rounded-[28px] bg-brand/90" />
        <div className="h-56 animate-pulse rounded-[20px] bg-line" />
        <div className="h-32 animate-pulse rounded-[20px] bg-line/70" />
      </div>
    </main>
  );
}
