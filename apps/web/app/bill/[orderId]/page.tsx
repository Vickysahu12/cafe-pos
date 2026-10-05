// app/bill/[orderId]/page.tsx
// ADDED (2026-10-05): DIGITAL BILL — "Bill on WhatsApp" feature ka customer side.
// USE CASE: Cashier payment ke baad app se customer ke WhatsApp pe yeh link bhejta hai
// (order.billraw.in/bill/<orderId>). Customer bill dekhta hai, PDF save kar sakta hai.
// Cafe ko thermal printer ki zaroorat nahi — chhote cafes ke liye bada fayda.
//
// DESIGN:
//  - SERVER component: bill server pe hi ban ke aata hai → 4G pe turant khulta hai, aur
//    WhatsApp link preview ("Bill #12 · Brew House Café · ₹420") metadata se banta hai.
//  - Receipt jaisa look (landing/menu wala espresso brand), dashed lines, tabular numbers.
//  - Label "Bill", "Tax Invoice" NAHI — GST tax invoice ke apne niyam hain (HSN/SAC,
//    CGST/SGST split…). Cafe ka GSTIN ho to dikhate hain, bas.
//  - Print CSS: buttons chhup jaate hain, sirf bill print/PDF hota hai.
//  - noindex (root layout se) — bills Google pe kabhi nahi aane chahiye.

import type { Metadata } from 'next';
import { cache } from 'react';
import Link from 'next/link';
import { ReceiptText } from 'lucide-react';
import { ApiError, publicMenuApi, type PublicBill } from '@/lib/api';
import { formatINR } from '@/lib/money';
import { Monogram, StateScreen, VegMark } from '@/components/ui';
import { PrintButton } from './PrintButton';

type Params = { params: Promise<{ orderId: string }> };

const PAYMENT_LABEL: Record<NonNullable<PublicBill['paymentMethod']>, string> = {
  CASH: 'Cash',
  UPI: 'UPI',
  CARD: 'Card',
  CREDIT: 'Credit',
  SPLIT: 'Split payment',
};

// Server UTC pe chalta hai — bill hamesha India ke time mein
const istDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

// cache(): generateMetadata + page dono ek hi request mein bill maangte hain — API sirf EK baar
const loadBill = cache(async (orderId: string): Promise<{ bill: PublicBill | null; error: 'not-found' | 'failed' | null }> => {
  try {
    return { bill: await publicMenuApi.getBill(orderId), error: null };
  } catch (err) {
    return { bill: null, error: err instanceof ApiError && err.status === 404 ? 'not-found' : 'failed' };
  }
});

/** Bill ki halat: badge text + rang */
function statusOf(bill: PublicBill): { label: string; cls: string } {
  if (bill.paymentStatus === 'REFUNDED') return { label: 'Cancelled · Refunded', cls: 'bg-danger-soft text-danger' };
  if (bill.orderStatus === 'CANCELLED') return { label: 'Cancelled', cls: 'bg-danger-soft text-danger' };
  if (bill.paymentStatus === 'PAID') {
    const via = bill.paymentMethod ? ` · ${PAYMENT_LABEL[bill.paymentMethod]}` : '';
    return { label: `Paid${via}`, cls: 'bg-success-soft text-success' };
  }
  return { label: 'Not paid yet', cls: 'bg-warn-soft text-warn-ink' };
}

// WhatsApp/Telegram link preview: "Bill #12 · Brew House Café" + amount
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { orderId } = await params;
  const { bill } = await loadBill(orderId);
  if (!bill) return { title: 'Bill' };
  const title = `Bill #${bill.orderNumber} · ${bill.outlet.name}`;
  const description = `${formatINR(bill.netAmount)} · ${statusOf(bill).label} · ${istDate(bill.createdAt)}`;
  return { title, description, openGraph: { title, description, type: 'website' } };
}

export default async function BillPage({ params }: Params) {
  const { orderId } = await params;
  const { bill, error } = await loadBill(orderId);

  if (!bill) {
    return error === 'not-found' ? (
      <StateScreen
        icon={ReceiptText}
        title="Bill not found"
        message="This link may be wrong or incomplete. Please ask the café to send it again."
      />
    ) : (
      <StateScreen
        icon={ReceiptText}
        tone="danger"
        title="Couldn't load the bill"
        message="Please check your internet and open the link again in a moment."
      />
    );
  }

  const status = statusOf(bill);
  const itemCount = bill.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <main className="min-h-dvh bg-paper px-4 py-6 print:bg-white print:p-0">
      <article className="mx-auto max-w-md overflow-hidden rounded-[28px] border border-line bg-surface shadow-[0_24px_48px_-24px_rgb(43_31_20/0.35)] print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {/* ── Cafe header ── */}
        <header
          className="px-6 pb-6 pt-7 text-white print:bg-white print:text-ink"
          style={{
            background:
              'radial-gradient(90% 80% at 100% 0%, rgb(192 138 46 / 0.30) 0%, rgb(192 138 46 / 0) 60%), var(--color-brand)',
          }}
        >
          <div className="flex items-start gap-4">
            <Monogram name={bill.outlet.name} className="h-12 w-12 text-lg print:hidden" />
            <div className="min-w-0">
              <h1 className="text-balance text-[22px] font-bold leading-tight tracking-[-0.01em]">{bill.outlet.name}</h1>
              <p className="mt-1 text-sm leading-snug text-white/70 print:text-muted">{bill.outlet.address}</p>
              {bill.outlet.phone && <p className="tabular mt-1 text-sm text-white/70 print:text-muted">Ph: {bill.outlet.phone}</p>}
              {bill.outlet.gstNumber && (
                <p className="tabular mt-0.5 text-sm text-white/70 print:text-muted">GSTIN: {bill.outlet.gstNumber}</p>
              )}
            </div>
          </div>
        </header>

        <div className="px-6 pb-6 pt-5">
          {/* ── Status + meta ── */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink">Bill #{bill.orderNumber}</h2>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.cls}`}>{status.label}</span>
          </div>
          <dl className="tabular mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted">Date</dt>
              <dd className="mt-0.5 font-semibold text-ink">{istDate(bill.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Time</dt>
              <dd className="mt-0.5 font-semibold text-ink">{istTime(bill.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Order</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {bill.table ? `Table ${bill.table.tableNumber}` : bill.orderType === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
              </dd>
            </div>
          </dl>

          {/* ── Items ── */}
          <div className="mt-5 border-t border-dashed border-line-strong pt-4">
            <div className="flex justify-between text-xs font-semibold text-muted">
              <span>
                {itemCount} item{itemCount === 1 ? '' : 's'}
              </span>
              <span>Amount</span>
            </div>
            <ul className="mt-2">
              {bill.items.map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-2.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <VegMark isVeg={item.product.isVeg} className="mt-0.75" />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug text-ink">{item.product.name}</p>
                      <p className="tabular text-sm text-muted">
                        {item.quantity} × {formatINR(item.unitPrice)}
                      </p>
                    </div>
                  </div>
                  <span className="tabular shrink-0 text-[15px] font-semibold text-ink">{formatINR(item.totalPrice)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Totals ── */}
          <dl className="tabular mt-2 space-y-2 border-t border-dashed border-line-strong pt-4 text-[15px]">
            <div className="flex justify-between text-muted">
              <dt>Item total</dt>
              <dd className="text-ink">{formatINR(bill.totalAmount)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>GST</dt>
              <dd className="text-ink">{formatINR(bill.taxAmount)}</dd>
            </div>
            {bill.discountAmount > 0 && (
              <div className="flex justify-between text-success">
                <dt>Discount</dt>
                <dd>−{formatINR(bill.discountAmount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-line pt-3">
              <dt className="text-base font-bold text-ink">Total</dt>
              <dd className="text-2xl font-bold tracking-tight text-ink">{formatINR(bill.netAmount)}</dd>
            </div>
          </dl>

          <p className="mt-6 text-center text-sm font-medium text-muted">Thank you for visiting. See you again!</p>
        </div>

        <footer className="border-t border-line bg-paper px-6 py-3 text-center text-xs text-muted print:bg-white">
          Bill generated by{' '}
          <a href="https://billraw.in" className="font-bold text-ink underline-offset-2 hover:underline">
            BillRaw
          </a>
        </footer>
      </article>

      {/* ── Actions (print mein chhup jaate hain) ── */}
      <div className="mx-auto mt-4 flex max-w-md gap-3 print:hidden">
        <PrintButton />
        <Link
          href={`/order/${bill.outlet.slug}`}
          className="flex h-12 flex-1 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-[15px] font-bold text-ink transition-[transform,background-color] hover:bg-brand-soft active:scale-[0.98]"
        >
          View menu
        </Link>
      </div>
    </main>
  );
}
