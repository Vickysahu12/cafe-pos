'use client';

// app/d/[token]/page.tsx
// ADDED (2026-10-18): WHATSAPP DELIVERY LINK — delivery boy ka page (order.billraw.in/d/<token>)
// USE CASE: Cafe ka cashier WhatsApp pe yeh link bhejta hai. Delivery boy ke paas na app hai na login.
// Darwaze pe: customer ko call / Maps → paise lo (Cash ya cafe ka UPI QR) → "Delivered" → cafe ke
// phone pe turant "Delivered ✅ · ₹230 Cash · Raju".
// UX rules (Vicky: "most important feature, trust nahi tootna chahiye"):
//  - Ek hi kaam saaf: kitna lena hai bada likha, ek bada button. Cash/UPI chune bina button band.
//  - Confirm dialog — galti se tap pe paisa record na ho
//  - Bill beech mein badla / counter pe pay ho gaya → server 409 → naya amount dikhao, dobara confirm
//  - Kam paise mile → "Different amount" (cafe ko ⚠️ dikhta hai, order unpaid rehta hai)
//  - Customer nahi mila → ek tap, cafe ko pata chal jaata hai
//  - Link band (naya bheja / galat) / expire / cancel / delivered → saaf screen, kya karna hai
//  - Tab pe wapas aate hi taaza status (beech mein cancel ho gaya ho)
// CONNECTED TO: lib/api.ts (riderApi), lib/upi.ts, backend modules/delivery (rider.routes.ts)

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  AlertTriangle, Banknote, Bike, CircleCheckBig, Clock3, Link2Off, Loader2, MapPin, Navigation, Phone, QrCode, Smartphone, XCircle,
} from 'lucide-react';
import { riderApi, ApiError, type RiderView } from '@/lib/api';
import { buildUpiLink } from '@/lib/upi';
import { formatINR, round2 } from '@/lib/money';
import { PoweredBy, StateScreen } from '@/components/ui';

type Method = 'CASH' | 'UPI';
type OutView = Extract<RiderView, { state: 'OUT' }>;

const prettyPhone = (p: string) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;

export default function DeliveryLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<RiderView | null>(null);
  const [loadError, setLoadError] = useState<{ status?: number; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await riderApi.get(token));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? { status: err.status, message: err.message } : { message: 'Something went wrong.' });
    }
  }, [token]);

  useEffect(() => {
    // Page khulte hi delivery fetch — data-fetching effect (intentional, status page jaisa)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Tab pe wapas aaye (WhatsApp se lautke) → taaza status — beech mein cancel/charge badla ho
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (loadError && !view) {
    const gone = loadError.status === 404;
    return (
      <StateScreen
        icon={gone ? Link2Off : AlertTriangle}
        tone="danger"
        title={gone ? 'This link is not valid' : "Couldn't open the delivery"}
        message={gone ? 'The café may have sent a new link or changed the delivery person. Ask them on WhatsApp.' : loadError.message}
        action={gone ? undefined : { label: 'Try again', onClick: load }}
      />
    );
  }
  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-paper" aria-busy="true">
        <Loader2 size={28} className="animate-spin text-brand" aria-label="Loading delivery" />
      </main>
    );
  }

  const callCafe = { label: `Call ${view.outletName}`, href: `tel:+91${view.outletPhone}` };

  if (view.state === 'CANCELLED') {
    return (
      <StateScreen
        icon={XCircle}
        tone="danger"
        title={`Order #${view.orderNumber} was cancelled`}
        message={`Don't deliver it. Please take the food back to ${view.outletName}.`}
        action={callCafe}
      />
    );
  }
  if (view.state === 'EXPIRED') {
    return (
      <StateScreen
        icon={Clock3}
        tone="danger"
        title="This link has expired"
        message={`Links work for 12 hours. Call ${view.outletName} and they will mark order #${view.orderNumber} delivered.`}
        action={callCafe}
      />
    );
  }
  if (view.state === 'DELIVERED') {
    const got =
      view.collected && view.collected > 0
        ? `${formatINR(view.collected)} collected by ${view.collectedMethod === 'UPI' ? 'UPI' : 'cash'}.`
        : 'Nothing to collect. It was already paid.';
    return (
      <StateScreen
        icon={CircleCheckBig}
        title={`Order #${view.orderNumber} delivered`}
        message={`${got} ${view.outletName} can see it now. Thank you!`}
      />
    );
  }

  // key = amount: bill badla (charge / counter pe pay) → form (Cash/UPI, kam amount, QR) naye sire se
  return <OutForDelivery key={view.amountDue} token={token} view={view} onChange={setView} reload={load} />;
}

function OutForDelivery({
  token,
  view,
  onChange,
  reload,
}: {
  token: string;
  view: OutView;
  onChange: (v: RiderView) => void;
  reload: () => Promise<void>;
}) {
  const due = view.amountDue;
  const [method, setMethod] = useState<Method | null>(null);
  const [different, setDifferent] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState<'deliver' | 'issue' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  const upiLink = view.upi ? buildUpiLink({ upiId: view.upi.id, name: view.upi.name, amount: due, note: `Order ${view.orderNumber}` }) : null;
  useEffect(() => {
    if (!showQr || !upiLink) return;
    let alive = true;
    QRCode.toDataURL(upiLink, { margin: 1, width: 440, errorCorrectionLevel: 'M' })
      .then((src) => alive && setQrSrc(src))
      .catch(() => alive && setQrSrc(null));
    return () => {
      alive = false;
    };
  }, [showQr, upiLink]);

  const typed = Number(amountText.replace(',', '.'));
  const collected = due === 0 ? 0 : different ? (Number.isFinite(typed) ? round2(typed) : NaN) : due;
  const amountInvalid = different && (amountText.trim() === '' || !Number.isFinite(collected) || collected < 0 || collected > due);
  const needsMethod = due > 0 && collected > 0;
  const canDeliver = !busy && !amountInvalid && (!needsMethod || !!method);

  const mapsUrl =
    view.lat != null && view.lng != null
      ? `https://www.google.com/maps/search/?api=1&query=${view.lat},${view.lng}`
      : view.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(view.address)}`
        : null;

  const deliver = async () => {
    if (!canDeliver) return;
    const what =
      due === 0
        ? `Mark order #${view.orderNumber} as delivered?`
        : collected === 0
          ? `Delivered, but collected nothing? The café will be told.`
          : `Delivered and collected ${formatINR(collected)} by ${method === 'UPI' ? 'UPI' : 'cash'}?`;
    if (!window.confirm(what)) return;
    setBusy('deliver');
    setError(null);
    try {
      onChange(await riderApi.delivered(token, { expectedDue: due, collected, ...(needsMethod ? { method: method! } : {}) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
      // Bill badla / counter pe pay hua / cancel → taaza amount + state dikhao
      if (err instanceof ApiError && (err.status === 409 || err.status === 410)) await reload();
    } finally {
      setBusy(null);
    }
  };

  const notAvailable = async () => {
    if (busy || !window.confirm("Tell the café the customer isn't available?")) return;
    setBusy('issue');
    setError(null);
    try {
      onChange(await riderApi.customerUnavailable(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Please call the café.');
      if (err instanceof ApiError && (err.status === 409 || err.status === 410)) await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-dvh bg-paper pb-36">
      <div className="mx-auto max-w-md px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-roast-ink">
            <Bike size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-muted">Delivery · {view.outletName}</p>
            <h1 className="text-2xl font-bold tracking-tight text-ink">Order #{view.orderNumber}</h1>
          </div>
        </div>

        {view.issue === 'CUSTOMER_UNAVAILABLE' && (
          <div role="status" className="mt-4 flex items-start gap-2 rounded-[20px] border border-line bg-brand-soft p-4 text-sm font-semibold text-ink">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-roast-ink" aria-hidden="true" />
            <span>The café knows the customer wasn&apos;t available. They may call you.</span>
          </div>
        )}

        {/* Customer */}
        <section aria-label="Customer" className="mt-4 rounded-[20px] border border-line bg-surface p-4">
          <p className="text-[17px] font-bold text-ink">{view.customerName ?? 'Customer'}</p>
          {view.address && <p className="mt-1.5 text-[15px] leading-snug text-ink">{view.address}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {view.customerPhone ? (
              <a
                href={`tel:+91${view.customerPhone}`}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface text-[15px] font-bold text-ink active:scale-[0.98]"
                aria-label={`Call ${prettyPhone(view.customerPhone)}`}
              >
                <Phone size={17} aria-hidden="true" /> Call
              </a>
            ) : (
              <span />
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface text-[15px] font-bold text-ink active:scale-[0.98]"
              >
                <Navigation size={17} aria-hidden="true" /> {view.lat != null ? 'Exact pin' : 'Maps'}
              </a>
            )}
          </div>
          {view.lat != null && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <MapPin size={13} aria-hidden="true" /> The customer shared their live location
            </p>
          )}
        </section>

        {/* Amount */}
        <section aria-label="Payment" className="mt-3 rounded-[20px] border border-line bg-surface p-4">
          {due === 0 ? (
            <div className="flex items-center gap-3">
              <CircleCheckBig size={22} className="shrink-0 text-success" aria-hidden="true" />
              <div>
                <p className="text-[17px] font-bold text-ink">Already paid</p>
                <p className="text-sm text-muted">Don&apos;t collect any money. Just hand over the order.</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-muted">Collect from customer</p>
              <p className="tabular mt-0.5 text-4xl font-bold tracking-tight text-ink">{formatINR(due)}</p>

              {/* Darwaze pe UPI: cafe ka verified UPI, amount bhara hua */}
              {upiLink && (
                <div className="mt-3">
                  {showQr ? (
                    <div className="flex flex-col items-center rounded-2xl border border-line bg-paper p-3">
                      {qrSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrSrc} alt={`UPI QR for ${formatINR(due)}`} width={220} height={220} className="rounded-lg bg-white" />
                      ) : (
                        <Loader2 size={24} className="my-20 animate-spin text-brand" aria-label="Making QR" />
                      )}
                      <p className="mt-2 text-sm font-semibold text-ink">Pays {view.upi!.name}</p>
                      <p className="text-xs text-muted">{view.upi!.id}</p>
                      <p className="mt-2 text-center text-xs text-muted">Choose UPI below only after the customer&apos;s app shows the payment is done.</p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowQr(true)}
                      className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold text-roast-ink hover:bg-brand-soft"
                    >
                      <QrCode size={16} aria-hidden="true" /> Show UPI QR to customer
                    </button>
                  )}
                </div>
              )}

              <p className="mt-4 text-sm font-semibold text-ink">How did they pay?</p>
              <div className="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
                {(
                  [
                    { m: 'CASH' as const, label: 'Cash', Icon: Banknote },
                    { m: 'UPI' as const, label: 'UPI', Icon: Smartphone },
                  ]
                ).map(({ m, label, Icon }) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => setMethod(m)}
                    className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 text-[15px] font-bold transition-colors ${
                      method === m ? 'border-brand bg-brand-soft text-ink' : 'border-line bg-surface text-muted'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>

              {different ? (
                <div className="mt-3">
                  <label htmlFor="collected" className="text-sm font-semibold text-ink">
                    Amount you collected
                  </label>
                  <input
                    id="collected"
                    inputMode="decimal"
                    value={amountText}
                    onChange={(e) => setAmountText(e.target.value.replace(/[^0-9.,]/g, '').slice(0, 9))}
                    placeholder={`Less than ${formatINR(due)}`}
                    className={`mt-1.5 h-12 w-full rounded-2xl border bg-surface px-4 text-base font-bold text-ink focus:border-roast focus:outline-none ${
                      amountInvalid && amountText ? 'border-danger' : 'border-line'
                    }`}
                    aria-invalid={amountInvalid}
                  />
                  {amountInvalid && amountText && (
                    <p className="mt-1 text-sm font-semibold text-danger">Enter an amount from ₹0 to {formatINR(due)}</p>
                  )}
                  <p className="mt-1 text-xs text-muted">The café will see that the full amount wasn&apos;t collected.</p>
                  <button type="button" onClick={() => { setDifferent(false); setAmountText(''); }} className="mt-1 text-sm font-bold text-roast-ink">
                    Collected the full {formatINR(due)}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setDifferent(true)} className="mt-3 text-sm font-bold text-roast-ink">
                  Customer paid a different amount?
                </button>
              )}
            </>
          )}
        </section>

        {error && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-[20px] border border-danger/20 bg-danger-soft p-4 text-sm font-semibold text-danger">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {view.issue !== 'CUSTOMER_UNAVAILABLE' && (
          <button
            type="button"
            onClick={notAvailable}
            disabled={!!busy}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-muted disabled:opacity-60"
          >
            {busy === 'issue' && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Customer not available?
          </button>
        )}

        <div className="mt-6">
          <PoweredBy />
        </div>
      </div>

      {/* Delivered */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={deliver}
          disabled={!canDeliver}
          aria-busy={busy === 'deliver'}
          className="pointer-events-auto mx-auto flex h-16 w-full max-w-md items-center justify-center gap-2 rounded-[20px] bg-brand px-5 text-[16px] font-bold text-white shadow-[0_18px_40px_-12px_rgb(43_31_20/0.65)] transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.99] disabled:opacity-60"
        >
          {busy === 'deliver' ? (
            <>
              <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Saving…
            </>
          ) : due === 0 ? (
            'Delivered'
          ) : needsMethod && !method ? (
            'Choose Cash or UPI'
          ) : amountInvalid ? (
            'Enter the amount collected'
          ) : collected === 0 ? (
            'Delivered · nothing collected'
          ) : (
            `Delivered · ${formatINR(collected)} collected`
          )}
        </button>
      </div>
    </main>
  );
}
