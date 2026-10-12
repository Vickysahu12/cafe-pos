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
//
// ADDED (2026-10-06): "YOUR DETAILS" — naam (hamesha) + mobile (takeaway pe zaroori, dine-in
// pe optional). Kyun: rush mein "#23 kiska?" ki jagah "Rahul, your order is ready", aur customer
// table se uth jaaye to cashier call kar sake. Privacy: sirf cafe ko is order ke liye; marketing
// nahi; 30 din baad server se phone delete. Customer ke apne browser mein yaad rehta hai.
//
// ADDED (2026-10-11): DELIVERY — cafe ne Settings mein on kiya ho (aur table QR se nahi aaye) to
// Takeaway | Delivery chunne ka option. Delivery: mobile + address zaroori, delivery charge bill mein,
// minimum order se kam pe button band (saaf "₹X aur add karo"). Setting har baar FRESH server se
// (owner ne abhi band kiya ho to purani cached value se order na jaaye). Charge server lagata hai.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowRight, Armchair, Banknote, Bike, Loader2, MapPin, Phone, Plus, ShoppingBag, Trash2, UserRound } from 'lucide-react';
import { publicMenuApi, type DeliveryInfo, type OrderItemPayload } from '@/lib/api';
import { useCartStore, useBindCartToOutlet } from '@/lib/cart-store';
import { billTotals, formatINR, round2 } from '@/lib/money';
import { ProductTile } from '@/lib/product-visual';
import { QtyStepper, StateScreen, VegMark } from '@/components/ui';
import { isValidCustomerName, normalizeIndianMobile } from '@/lib/phone';

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

  // ADDED (2026-10-06): customer details — store mein (customer ke browser mein yaad)
  const customer = useCartStore((s) => s.customer);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const name = customer?.name ?? '';
  const phone = customer?.phone ?? '';
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const phoneRequired = !table; // table nahi = takeaway → phone hi pehchaan hai
  const [error, setError] = useState<string | null>(null);

  // ADDED (2026-10-11): DELIVERY
  const mode = useCartStore((s) => s.mode);
  const setMode = useCartStore((s) => s.setMode);
  const address = customer?.address ?? '';
  const [addressError, setAddressError] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryInfo | null>(null);
  useEffect(() => {
    if (table) return; // table pe baithe customer ko delivery ka sawaal hi nahi
    let alive = true;
    publicMenuApi
      .getMenu(slug)
      .then((m) => alive && setDelivery(m.delivery ?? { enabled: false, charge: 0, minOrder: 0, area: null }))
      .catch(() => alive && setDelivery({ enabled: false, charge: 0, minOrder: 0, area: null }));
    return () => {
      alive = false;
    };
  }, [slug, table]);
  // Cafe ne delivery band kar di / table QR → takeaway pe wapas
  useEffect(() => {
    if (mode === 'DELIVERY' && (table || (delivery && !delivery.enabled))) setMode('TAKEAWAY');
  }, [mode, table, delivery, setMode]);
  const isDelivery = !table && mode === 'DELIVERY' && !!delivery?.enabled;
  const canDeliver = !table && !!delivery?.enabled;

  const { subtotal, tax, total: itemsTotal } = billTotals(items);
  const deliveryCharge = isDelivery ? delivery!.charge : 0;
  const total = round2(itemsTotal + deliveryCharge);
  const shortBy = isDelivery && delivery!.minOrder > 0 ? round2(delivery!.minOrder - subtotal) : 0;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const menuHref = `/order/${slug}`;

  /** ADDED (2026-10-06): form check — server jaisa hi rule, error field ke paas */
  const validateDetails = (): { customerName: string; customerPhone?: string; deliveryAddress?: string } | null => {
    let ok = true;
    if (!isValidCustomerName(name)) {
      setNameError(name.trim() ? 'Please use letters only (max 40)' : 'Please enter your name');
      ok = false;
    }
    const normalized = phone.trim() ? normalizeIndianMobile(phone) : null;
    if (phone.trim() && !normalized) {
      setPhoneError('Enter a valid 10-digit mobile number');
      ok = false;
    } else if (phoneRequired && !normalized) {
      setPhoneError(isDelivery ? 'Mobile number is needed for delivery' : 'Mobile number is needed for takeaway orders');
      ok = false;
    }
    // ADDED (2026-10-11): DELIVERY address (server bhi 10–300 chars check karta hai)
    if (isDelivery && address.trim().length < 10) {
      setAddressError(address.trim() ? 'Please add house number, street and area' : 'Please enter your delivery address');
      ok = false;
    }
    if (!ok) {
      document.getElementById('details-heading')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    return {
      customerName: name.trim(),
      customerPhone: normalized ?? undefined,
      ...(isDelivery ? { deliveryAddress: address.trim().slice(0, 300) } : {}),
    };
  };

  // FIX (2026-10-12): idempotency key (dekho handlePlaceOrder). Items badle = naya order = nayi key.
  const requestIdRef = useRef<string | null>(null);
  useEffect(() => {
    requestIdRef.current = null;
  }, [items]);

  const handlePlaceOrder = async () => {
    if (placing || shortBy > 0) return;
    // FIX (2026-10-12): DUPLICATE ORDER. Order server pe ban gaya par response kho gaya (4G blip, Render
    // cold start) → error dikhta, customer dobara tap karta → DOOSRA order. Ab ek cart = ek key; retry pe
    // server wahi purana order lautata hai. Cart badla (neeche effect) to nayi key.
    if (!requestIdRef.current) requestIdRef.current = crypto.randomUUID();
    const details = validateDetails();
    if (!details) return;
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
        orderType: table ? 'DINE_IN' : isDelivery ? 'DELIVERY' : 'TAKEAWAY',
        tableId: table?.id,
        items: payload,
        ...details, // ADDED (2026-10-06): customerName (+ customerPhone)
        clientRequestId: requestIdRef.current, // FIX (2026-10-12)
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
        {/* ADDED (2026-10-11): Takeaway | Delivery — sirf jab cafe delivery karta hai */}
        {canDeliver && (
          <div role="radiogroup" aria-label="How do you want your order?" className="grid grid-cols-2 gap-1 rounded-[18px] bg-line p-1">
            {(['TAKEAWAY', 'DELIVERY'] as const).map((m) => {
              const active = (m === 'DELIVERY') === isDelivery;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setMode(m)}
                  className={`flex h-11 items-center justify-center gap-2 rounded-[14px] text-[15px] font-bold transition-colors ${
                    active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                  }`}
                >
                  {m === 'DELIVERY' ? <Bike size={18} aria-hidden="true" /> : <ShoppingBag size={18} aria-hidden="true" />}
                  {m === 'DELIVERY' ? 'Delivery' : 'Takeaway'}
                </button>
              );
            })}
          </div>
        )}

        {/* Order type */}
        <div className="flex items-center gap-3.5 rounded-[20px] bg-brand p-4 text-white">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-roast-light">
            {table ? <Armchair size={21} aria-hidden="true" /> : isDelivery ? <Bike size={21} aria-hidden="true" /> : <ShoppingBag size={21} aria-hidden="true" />}
          </span>
          <div>
            <p className="text-[15px] font-bold">{table ? `Dine-in · Table ${table.tableNumber}` : isDelivery ? 'Delivery' : 'Takeaway'}</p>
            <p className="text-sm text-white/70">
              {/* UPDATED (2026-10-06): ab naam se bulaate hain (customer details) */}
              {table
                ? "We'll bring it to your table."
                : isDelivery
                  ? delivery?.area
                    ? `The café delivers ${delivery.area.charAt(0).toLowerCase()}${delivery.area.slice(1)}.`
                    : 'The café will bring it to your address.'
                  : "We'll call your name at the counter when it's ready."}
            </p>
          </div>
        </div>

        {/* ADDED (2026-10-06): Your details — naam + mobile */}
        <section aria-labelledby="details-heading" className="rounded-[20px] border border-line bg-surface p-4">
          <h2 id="details-heading" className="text-[15px] font-bold text-ink">
            Your details
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {table
              ? 'So the café knows whose order it is.'
              : isDelivery
                ? 'So the café can reach you and find your place.'
                : "So the café can call you when it's ready."}
          </p>

          <label htmlFor="cust-name" className="mt-4 block text-sm font-semibold text-ink">
            Name
          </label>
          <div
            className={`mt-1.5 flex h-12 items-center gap-2.5 rounded-2xl border bg-surface px-3.5 transition-colors focus-within:border-roast ${
              nameError ? 'border-danger' : 'border-line'
            }`}
          >
            <UserRound size={18} className="shrink-0 text-muted" aria-hidden="true" />
            <input
              id="cust-name"
              value={name}
              onChange={(e) => {
                setCustomer({ name: e.target.value.slice(0, 40), phone, address });
                if (nameError) setNameError(null);
              }}
              autoComplete="given-name"
              placeholder="e.g. Rahul"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? 'cust-name-err' : undefined}
              className="h-full w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
          {nameError && (
            <p id="cust-name-err" role="alert" className="mt-1.5 text-sm font-semibold text-danger">
              {nameError}
            </p>
          )}

          <label htmlFor="cust-phone" className="mt-4 flex items-baseline justify-between text-sm font-semibold text-ink">
            Mobile number
            <span className="text-xs font-normal text-muted">
              {phoneRequired ? (isDelivery ? 'Required for delivery' : 'Required for takeaway') : 'Optional'}
            </span>
          </label>
          <div
            className={`mt-1.5 flex h-12 items-center gap-2.5 rounded-2xl border bg-surface px-3.5 transition-colors focus-within:border-roast ${
              phoneError ? 'border-danger' : 'border-line'
            }`}
          >
            <Phone size={18} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="tabular text-[15px] text-muted">+91</span>
            <input
              id="cust-phone"
              value={phone}
              onChange={(e) => {
                setCustomer({ name, phone: e.target.value.slice(0, 16), address });
                if (phoneError) setPhoneError(null);
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="98765 43210"
              aria-invalid={!!phoneError}
              aria-describedby={phoneError ? 'cust-phone-err' : 'cust-phone-note'}
              className="tabular h-full w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
            />
          </div>
          {phoneError ? (
            <p id="cust-phone-err" role="alert" className="mt-1.5 text-sm font-semibold text-danger">
              {phoneError}
            </p>
          ) : (
            <p id="cust-phone-note" className="mt-1.5 text-xs leading-relaxed text-muted">
              {table && 'Helps the café reach you if you step away. '}
              Shared only with the café for this order, never for marketing. Deleted after 30 days.
            </p>
          )}

          {/* ADDED (2026-10-11): DELIVERY address */}
          {isDelivery && (
            <>
              <label htmlFor="cust-address" className="mt-4 block text-sm font-semibold text-ink">
                Delivery address
              </label>
              <div
                className={`mt-1.5 flex gap-2.5 rounded-2xl border bg-surface px-3.5 py-3 transition-colors focus-within:border-roast ${
                  addressError ? 'border-danger' : 'border-line'
                }`}
              >
                <MapPin size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                <textarea
                  id="cust-address"
                  value={address}
                  onChange={(e) => {
                    setCustomer({ name, phone, address: e.target.value.slice(0, 300) });
                    if (addressError) setAddressError(null);
                  }}
                  rows={3}
                  autoComplete="street-address"
                  placeholder="House / flat no., street, area, landmark"
                  aria-invalid={!!addressError}
                  aria-describedby={addressError ? 'cust-address-err' : undefined}
                  className="w-full resize-none bg-transparent text-[15px] leading-snug text-ink placeholder:text-muted focus:outline-none"
                />
              </div>
              {addressError && (
                <p id="cust-address-err" role="alert" className="mt-1.5 text-sm font-semibold text-danger">
                  {addressError}
                </p>
              )}
            </>
          )}
        </section>

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
            {/* ADDED (2026-10-11) */}
            {isDelivery && (
              <div className="flex justify-between text-muted">
                <dt>Delivery</dt>
                <dd className="text-ink">{deliveryCharge > 0 ? formatINR(deliveryCharge) : 'Free'}</dd>
              </div>
            )}
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
            <p className="text-[15px] font-bold text-ink">{isDelivery ? 'Pay on delivery' : 'Pay at the counter'}</p>
            <p className="text-sm text-muted">Cash or UPI. No payment is taken online.</p>
          </div>
        </div>

        {/* ADDED (2026-10-11): minimum order for delivery */}
        {shortBy > 0 && (
          <div role="status" className="flex items-start gap-2 rounded-[20px] border border-line bg-brand-soft p-4 text-sm font-semibold text-ink">
            <Bike size={18} className="mt-0.5 shrink-0 text-roast-ink" aria-hidden="true" />
            <span>
              Minimum order for delivery is {formatINR(delivery!.minOrder)}. Add {formatINR(shortBy)} more, or switch to takeaway.
            </span>
          </div>
        )}

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
          disabled={placing || shortBy > 0}
          className="pointer-events-auto mx-auto flex h-16 w-full max-w-2xl items-center justify-between rounded-[20px] bg-brand px-5 text-white shadow-[0_18px_40px_-12px_rgb(43_31_20/0.65)] transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.99] disabled:opacity-80"
        >
          <span className="text-left">
            <span className="tabular block text-base font-bold">{formatINR(total)}</span>
            <span className="block text-xs text-white/65">{isDelivery ? 'Incl. GST and delivery' : 'Total incl. GST'}</span>
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
