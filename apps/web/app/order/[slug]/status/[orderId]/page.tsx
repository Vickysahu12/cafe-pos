'use client';

// app/order/[slug]/status/[orderId]/page.tsx
// USE CASE: Live order tracking after checkout. Polls the backend every 5 seconds
// (no Socket.io on the customer side — this stays a simple, no-login page) and
// stops polling once the order reaches a terminal state (SERVED/CANCELLED).
// CONNECTED TO: lib/api.ts (publicMenuApi.getOrderStatus).

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, ChefHat, Clock, XCircle } from 'lucide-react';
import { publicMenuApi, type PublicOrderStatus } from '@/lib/api';

type FetchState = 'loading' | 'error' | 'ready';

const STEPS: { key: string; label: string }[] = [
  { key: 'PENDING', label: 'Placed' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
];

const TERMINAL_STATUSES = ['SERVED', 'CANCELLED'];

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  PREPARING: 'Preparing',
  READY: 'Ready',
};

export default function OrderStatusPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();

  const [state, setState] = useState<FetchState>('loading');
  const [order, setOrder] = useState<PublicOrderStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = async () => {
    try {
      const data = await publicMenuApi.getOrderStatus(slug, orderId);
      setOrder(data);
      setState('ready');
      if (TERMINAL_STATUSES.includes(data.orderStatus) && intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, orderId]);

  if (state === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-brand" />
      </main>
    );
  }

  if (state === 'error' || !order) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h1 className="text-base font-semibold text-ink">Couldn&apos;t load your order</h1>
        <p className="mt-1 text-sm text-muted">Check your connection — we&apos;ll keep trying automatically.</p>
      </main>
    );
  }

  if (order.orderStatus === 'CANCELLED') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <XCircle className="h-6 w-6 text-red-500" />
        </div>
        <h1 className="text-base font-semibold text-ink">Order #{order.orderNumber} was cancelled</h1>
        <p className="mt-1 text-sm text-muted">Please check with staff at the counter.</p>
      </main>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === order.orderStatus);

  return (
    <main className="min-h-screen px-5 pb-16 pt-8">
      <div className="text-center">
        <p className="text-xs font-medium text-muted">Order #{order.orderNumber}</p>
        <h1 className="mt-1 text-xl font-bold text-ink">
          {order.orderStatus === 'SERVED' ? 'Enjoy your order!' : 'We\u2019re on it'}
        </h1>
      </div>

      {/* Step tracker */}
      <div className="mx-auto mt-8 flex max-w-sm items-center">
        {STEPS.map((step, i) => {
          const done = i <= currentIndex;
          const isLast = i === STEPS.length - 1;
          return (
            <div key={step.key} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    done ? 'bg-brand text-white' : 'bg-line text-muted'
                  }`}
                >
                  {done ? <Check size={16} /> : <Clock size={14} />}
                </div>
                <span className={`mt-2 text-center text-[11px] font-medium ${done ? 'text-ink' : 'text-muted'}`}>
                  {step.label}
                </span>
              </div>
              {!isLast && <div className={`mx-1 h-0.5 flex-1 ${i < currentIndex ? 'bg-brand' : 'bg-line'}`} />}
            </div>
          );
        })}
      </div>

      {/* Items */}
      <div className="mt-10 divide-y divide-line rounded-2xl border border-line">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span className="text-ink">
              {item.quantity} × {item.product.name}
            </span>
            <span className="text-xs font-medium text-muted">{ITEM_STATUS_LABEL[item.status] ?? item.status}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between px-1 text-sm">
        <span className="text-muted">Total</span>
        <span className="font-bold text-ink">₹{order.netAmount}</span>
      </div>

      <div className="mt-2 flex items-center gap-2 rounded-xl bg-brand-light px-4 py-3 text-xs text-brand">
        <ChefHat size={14} />
        <span>Pay at the counter by cash or UPI when your order is served.</span>
      </div>
    </main>
  );
}