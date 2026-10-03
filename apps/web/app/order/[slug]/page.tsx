'use client';

// app/order/[slug]/page.tsx
// USE CASE: Customer QR menu — pehla page jo customer scan karke dekhta hai.
//
// UI/UX PASS (2026-09-30):
//  - FIX: "Table 12" HARDCODED tha — ab per-table QR (?table=<id>) se asli table
//  - FIX: back button hataya (QR se khula pehla page, "back" kahin nahi jaata tha)
//  - FSSAI VegMark, "Veg only", search, scroll-spy chips, "from ₹X", track banner
//
// REDESIGN (2026-10-02) — premium look, billraw.in landing jaisa brand (espresso + roast gold):
//  - Espresso HERO: cafe monogram, naam, address, Table/Takeaway badge, "Pay at counter"
//    + "Live tracking" — customer ko pehli nazar mein pata ki yahan kya hoga
//  - Menu ek paper "sheet" pe jo hero ke upar chadhti hai (native app jaisa feel)
//  - "POPULAR HERE" row — cafe ke ASLI best sellers (backend: last 30 din, quantity se).
//    Naye cafe (koi order nahi) pe row dikhti hi nahi — fake "Bestseller" tag kabhi nahi.
//  - Har item pe bada PHOTO SLOT (lib/product-visual.tsx ProductArt) + uske neeche latka
//    ADD — Swiggy/Zomato pattern, Indian customer ko sikhana nahi padta. V2 mein yahi
//    slot asli photo lega.
//  - Item/photo pe tap → detail sheet (description, size, add-on, kitchen note) — ab
//    simple items pe bhi note likh sakte hain ("less spicy")
//  - Floating cart bar: count badge "pop" karta hai har add pe (feedback)

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Armchair, Banknote, MapPin, Radio, Search, ShoppingBag, UtensilsCrossed, X,
} from 'lucide-react';
import { publicMenuApi, type PublicMenu, type Product } from '@/lib/api';
import { useCartStore, useBindCartToOutlet, simpleKey } from '@/lib/cart-store';
import { billTotals, formatINR } from '@/lib/money';
import { ProductArt } from '@/lib/product-visual';
import { AddButton, Monogram, PoweredBy, QtyStepper, StateScreen, VegMark } from '@/components/ui';
import { ProductModal } from './ProductModal';

type FetchState = 'loading' | 'error' | 'ready';

// Table QR ka context itni der tak yaad rahe (baad mein counter pe aaye to takeaway)
const TABLE_TTL_MS = 3 * 60 * 60 * 1000;
const LAST_ORDER_TTL_MS = 6 * 60 * 60 * 1000;
// Popular row tabhi jab kam se kam itne items ho (1-2 items ki "row" adhoori lagti hai)
const MIN_POPULAR = 3;

const minPrice = (p: Product) => (p.variants.length > 0 ? Math.min(...p.variants.map((v) => v.price)) : p.price);
const hasOptions = (p: Product) => p.variants.length > 0 || p.addons.length > 0;

export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  useBindCartToOutlet(slug); // FIX (2026-09-29): cart sirf isi cafe ka (dekho lib/cart-store.ts)
  const router = useRouter();

  const [state, setState] = useState<FetchState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  const items = useCartStore((s) => s.items);
  const table = useCartStore((s) => s.table);
  const setTable = useCartStore((s) => s.setTable);
  const lastOrder = useCartStore((s) => s.lastOrder);
  const addItem = useCartStore((s) => s.addItem);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);

  // Page khulne ka waqt — render mein Date.now() impure hota hai, isliye ek baar yahan
  const [openedAt] = useState(() => Date.now());

  const fetchMenu = async () => {
    try {
      // ?table=<id> — useSearchParams ki jagah yahan padhte hain (Suspense boundary ki zaroorat nahi)
      const tableParam = new URLSearchParams(window.location.search).get('table');
      const data = await publicMenuApi.getMenu(slug, tableParam);
      setMenu(data);
      setActiveCategory(data.categories[0]?.id ?? null);
      if (data.table) setTable({ ...data.table, setAt: Date.now() });
      setState('ready');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : null);
      setState('error');
    }
  };

  useEffect(() => {
    // Page khulte hi menu fetch — data-fetching effect, setState await ke BAAD hota hai (intentional)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const retryLoad = () => {
    setState('loading');
    fetchMenu();
  };

  // Purana table context expire (kal Table 5 pe the, aaj counter pe — takeaway)
  useEffect(() => {
    if (table?.setAt && openedAt - table.setAt > TABLE_TTL_MS) setTable(null);
  }, [table, setTable, openedAt]);

  const showTrackBanner = !!lastOrder && openedAt - lastOrder.placedAt < LAST_ORDER_TTL_MS;

  // Search + veg filter
  const visibleCategories = useMemo(() => {
    if (!menu) return [];
    const q = query.trim().toLowerCase();
    return menu.categories
      .map((c) => ({
        ...c,
        products: c.products.filter(
          (p) =>
            (!vegOnly || p.isVeg) &&
            (!q || p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
        ),
      }))
      .filter((c) => c.products.length > 0);
  }, [menu, query, vegOnly]);

  // Popular: backend ke ids → products (veg filter respect; search ke dauran chhupao)
  const popularProducts = useMemo(() => {
    if (!menu?.popular?.length || query.trim()) return [];
    const byId = new Map(menu.categories.flatMap((c) => c.products.map((p) => [p.id, p] as const)));
    return menu.popular
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p && (!vegOnly || p.isVeg));
  }, [menu, query, vegOnly]);

  const totalProducts = menu?.categories.reduce((n, c) => n + c.products.length, 0) ?? 0;
  const hasVeg = menu?.categories.some((c) => c.products.some((p) => p.isVeg)) ?? false;
  const hasNonVeg = menu?.categories.some((c) => c.products.some((p) => !p.isVeg)) ?? false;
  const showSearch = totalProducts > 8;
  const showVegToggle = hasVeg && hasNonVeg;

  // Scroll-spy: jo category screen pe hai uska chip active
  const chipRowRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (state !== 'ready') return;
    const sections = visibleCategories
      .map((c) => document.getElementById(`cat-${c.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCategory(visible[0].target.id.replace('cat-', ''));
      },
      { rootMargin: '-90px 0px -60% 0px' }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [state, visibleCategories]);

  // Active chip ko chip-row mein dikhate raho
  useEffect(() => {
    if (!activeCategory || !chipRowRef.current) return;
    const chip = chipRowRef.current.querySelector<HTMLElement>(`[data-cat="${activeCategory}"]`);
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeCategory]);

  const { total: cartTotal } = billTotals(items);
  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const quantityFor = (productId: string) => items.find((i) => i.key === simpleKey(productId))?.quantity ?? 0;

  const handleAdd = (product: Product) => {
    if (hasOptions(product)) {
      setModalProduct(product);
      return;
    }
    addItem(product, null, [], 1);
  };

  const scrollToCategory = (id: string) => {
    setActiveCategory(id);
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /** ADD / stepper — card aur popular row dono mein same */
  const renderAddControl = (product: Product) => {
    const qty = hasOptions(product) ? 0 : quantityFor(product.id);
    return qty > 0 ? (
      <QtyStepper
        size="sm"
        quantity={qty}
        label={product.name}
        onDecrement={() => decrementItem(simpleKey(product.id))}
        onIncrement={() => incrementItem(simpleKey(product.id))}
      />
    ) : (
      <AddButton onClick={() => handleAdd(product)} label={product.name} customisable={hasOptions(product)} />
    );
  };

  if (state === 'loading') return <MenuSkeleton />;

  if (state === 'error' || !menu) {
    return (
      <StateScreen
        icon={AlertTriangle}
        tone="danger"
        title="Couldn't load the menu"
        message={errorMessage ?? 'Check your internet connection and try again.'}
        action={{ label: 'Try again', onClick: retryLoad }}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-paper pb-36">
      {/* ── Hero ── */}
      <header
        className="text-white"
        style={{
          background:
            'radial-gradient(90% 80% at 100% 0%, rgb(192 138 46 / 0.30) 0%, rgb(192 138 46 / 0) 60%), var(--color-brand)',
        }}
      >
        <div className="mx-auto max-w-2xl px-5 pb-14 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <Monogram name={menu.outlet.name} className="h-12 w-12 text-lg" />
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-sm font-semibold ring-1 ring-white/15">
              {table ? (
                <>
                  <Armchair size={15} aria-hidden="true" /> Table {table.tableNumber}
                </>
              ) : (
                <>
                  <ShoppingBag size={15} aria-hidden="true" /> Takeaway
                </>
              )}
            </span>
          </div>

          <h1 className="mt-6 text-balance text-[28px] font-bold leading-[1.15] tracking-[-0.02em]">{menu.outlet.name}</h1>
          {menu.outlet.address && (
            <p className="mt-2 flex items-start gap-1.5 text-sm leading-snug text-white/70">
              <MapPin size={15} className="mt-px shrink-0" aria-hidden="true" />
              <span className="line-clamp-2">{menu.outlet.address}</span>
            </p>
          )}

          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-medium text-roast-light">
            <li className="flex items-center gap-1.5">
              <Banknote size={15} aria-hidden="true" /> Pay at the counter
            </li>
            <li className="flex items-center gap-1.5">
              <Radio size={15} aria-hidden="true" /> Live order tracking
            </li>
          </ul>
        </div>
      </header>

      {/* ── Menu sheet (hero ke upar chadhti hai) ── */}
      <div className="relative -mt-7 rounded-t-[28px] bg-paper">
        <div className="mx-auto max-w-2xl px-4 pt-5">
          {showTrackBanner && lastOrder && (
            <Link
              href={`/order/${slug}/status/${lastOrder.id}`}
              className="mb-4 flex animate-rise items-center gap-3 rounded-2xl border border-roast/25 bg-brand-soft px-4 py-3.5 transition-transform active:scale-[0.99]"
            >
              <span className="h-2.5 w-2.5 shrink-0 animate-ring rounded-full bg-roast" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink">
                Order #{lastOrder.orderNumber} is in progress
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-roast-ink">
                Track <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          )}

          {totalProducts > 0 && (showSearch || showVegToggle) && (
            <div className="flex items-center gap-2">
              {showSearch && (
                <label className="flex h-12 flex-1 items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 shadow-[0_1px_2px_rgb(26_20_14/0.04)] transition-colors focus-within:border-roast">
                  <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${totalProducts} dishes`}
                    aria-label="Search the menu"
                    className="h-full w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
                  />
                  {query && (
                    <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="-mr-1 p-1.5 text-muted">
                      <X size={16} />
                    </button>
                  )}
                </label>
              )}
              {showVegToggle && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={vegOnly}
                  onClick={() => setVegOnly((v) => !v)}
                  className={`flex h-12 shrink-0 items-center gap-2 rounded-2xl border px-3.5 text-sm font-semibold transition-colors ${
                    vegOnly ? 'border-veg/40 bg-success-soft text-veg' : 'border-line bg-surface text-ink'
                  } ${showSearch ? '' : 'ml-auto'}`}
                >
                  <VegMark isVeg />
                  Veg
                  {/* Chhota switch — on/off ek nazar mein (sirf rang pe depend nahi) */}
                  <span
                    aria-hidden="true"
                    className={`relative h-5 w-8 rounded-full transition-colors ${vegOnly ? 'bg-veg' : 'bg-line-strong'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${vegOnly ? 'translate-x-3.5' : 'translate-x-0.5'}`}
                    />
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {totalProducts === 0 ? (
          <div className="mx-auto max-w-2xl px-6 pb-10 pt-16 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-roast-ink">
              <UtensilsCrossed size={26} aria-hidden="true" />
            </span>
            <p className="mt-4 text-base font-bold text-ink">The menu isn&apos;t up yet</p>
            <p className="mt-1 text-sm text-muted">Please ask the staff to take your order.</p>
          </div>
        ) : (
          <>
            {/* ── Sticky category chips ── */}
            {visibleCategories.length > 1 && (
              <div className="sticky top-0 z-20 mt-3 border-b border-line/80 bg-paper/90 backdrop-blur-md">
                <nav
                  ref={chipRowRef}
                  aria-label="Menu categories"
                  className="no-scrollbar mx-auto flex max-w-2xl gap-2 overflow-x-auto px-4 py-3"
                >
                  {visibleCategories.map((cat) => {
                    const active = activeCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        data-cat={cat.id}
                        onClick={() => scrollToCategory(cat.id)}
                        aria-current={active ? 'true' : undefined}
                        className={`h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                          active ? 'bg-brand text-white' : 'border border-line bg-surface text-ink hover:border-line-strong'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </nav>
              </div>
            )}

            {/* ── Popular here ── */}
            {popularProducts.length >= MIN_POPULAR && (
              <section aria-labelledby="popular-h" className="mx-auto max-w-2xl pt-6">
                <div className="flex items-baseline justify-between gap-3 px-4">
                  <h2 id="popular-h" className="text-lg font-bold tracking-tight text-ink">
                    Popular here
                  </h2>
                  <span className="text-xs font-medium text-muted">Most ordered this month</span>
                </div>
                <ul className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-3">
                  {popularProducts.map((product) => (
                    <li key={product.id} className="w-37 shrink-0 snap-start">
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setModalProduct(product)}
                          aria-label={`${product.name} details`}
                          className="block w-full transition-transform active:scale-[0.98]"
                        >
                          <ProductArt name={product.name} iconSize={44} className="aspect-square w-full rounded-[20px]" />
                        </button>
                        <div className="absolute inset-x-0 -bottom-4 flex justify-center">{renderAddControl(product)}</div>
                      </div>
                      <div className="mt-7 flex items-start gap-1.5">
                        <VegMark isVeg={product.isVeg} className="mt-0.5" />
                        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{product.name}</h3>
                      </div>
                      <p className="tabular mt-1 pl-5.5 text-sm font-semibold text-ink">
                        {product.variants.length > 1 && <span className="mr-1 font-normal text-muted">from</span>}
                        {formatINR(minPrice(product))}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* ── Menu ── */}
            <div className="mx-auto max-w-2xl px-4">
              {visibleCategories.length === 0 && (
                <div className="pt-14 text-center">
                  <p className="text-base font-bold text-ink">No dishes found</p>
                  <p className="mt-1 text-sm text-muted">
                    Nothing matches{query ? ` “${query}”` : ''}{vegOnly ? ' in veg' : ''}. Try another word.
                  </p>
                </div>
              )}

              {visibleCategories.map((category) => (
                <section
                  key={category.id}
                  id={`cat-${category.id}`}
                  className="scroll-mt-20 pt-7"
                  aria-labelledby={`h-${category.id}`}
                >
                  <h2 id={`h-${category.id}`} className="flex items-baseline gap-2 text-lg font-bold tracking-tight text-ink">
                    {category.name}
                    <span className="text-sm font-medium text-muted">{category.products.length}</span>
                  </h2>

                  <ul className="divide-y divide-line">
                    {category.products.map((product) => (
                      <li key={product.id} className="flex gap-4 pb-8 pt-5">
                        <button
                          type="button"
                          onClick={() => setModalProduct(product)}
                          className="min-w-0 flex-1 text-left"
                          aria-label={`${product.name} details`}
                        >
                          <VegMark isVeg={product.isVeg} />
                          <h3 className="mt-1.5 text-base font-semibold leading-snug text-ink">{product.name}</h3>
                          <p className="tabular mt-1 text-[15px] font-semibold text-ink">
                            {product.variants.length > 1 && <span className="mr-1 text-sm font-normal text-muted">from</span>}
                            {formatINR(minPrice(product))}
                          </p>
                          {product.description && (
                            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted">{product.description}</p>
                          )}
                          {hasOptions(product) && (
                            <p className="mt-2 text-xs font-semibold text-roast-ink">Customisable</p>
                          )}
                        </button>

                        <div className="relative h-29 w-29 shrink-0">
                          <button
                            type="button"
                            onClick={() => setModalProduct(product)}
                            aria-label={`${product.name} details`}
                            tabIndex={-1}
                            className="block h-full w-full transition-transform active:scale-[0.98]"
                          >
                            <ProductArt name={product.name} iconSize={38} className="h-full w-full rounded-[20px]" />
                          </button>
                          <div className="absolute inset-x-0 -bottom-4 flex justify-center">{renderAddControl(product)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              <PoweredBy />
            </div>
          </>
        )}
      </div>

      {modalProduct && <ProductModal product={modalProduct} onClose={() => setModalProduct(null)} />}

      {/* ── Floating cart bar ── */}
      {cartCount > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => router.push(`/order/${slug}/cart`)}
            className="pointer-events-auto mx-auto flex h-16 w-full max-w-2xl animate-rise items-center gap-3 rounded-[20px] bg-brand pl-3 pr-5 text-white shadow-[0_18px_40px_-12px_rgb(43_31_20/0.65)] transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.99]"
          >
            <span
              key={cartCount}
              className="tabular flex h-10 min-w-10 animate-bump items-center justify-center rounded-[14px] bg-roast-light px-2 text-[15px] font-bold text-brand"
            >
              {cartCount}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="tabular block text-[15px] font-bold">{formatINR(cartTotal)}</span>
              <span className="block text-xs text-white/65">
                {cartCount} item{cartCount > 1 ? 's' : ''} · incl. GST
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-[15px] font-bold">
              View cart <ArrowRight size={18} aria-hidden="true" />
            </span>
          </button>
        </div>
      )}
    </main>
  );
}

function MenuSkeleton() {
  return (
    <main className="min-h-dvh bg-paper" aria-busy="true" aria-label="Loading menu">
      <div className="bg-brand">
        <div className="mx-auto max-w-2xl space-y-4 px-5 pb-16 pt-6">
          <div className="flex justify-between">
            <div className="h-12 w-12 animate-pulse rounded-2xl bg-white/10" />
            <div className="h-9 w-24 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="h-8 w-56 animate-pulse rounded-lg bg-white/15" />
          <div className="h-4 w-64 animate-pulse rounded bg-white/10" />
        </div>
      </div>
      <div className="relative -mt-7 rounded-t-[28px] bg-paper">
        <div className="mx-auto max-w-2xl px-4 pt-5">
          <div className="h-12 animate-pulse rounded-2xl bg-line/70" />
          <div className="flex gap-2 py-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-line" />
            ))}
          </div>
          {[0, 1, 2, 3].map((j) => (
            <div key={j} className="flex gap-4 border-b border-line pb-8 pt-5">
              <div className="flex-1 space-y-2.5">
                <div className="h-4 w-4 animate-pulse rounded bg-line" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
                <div className="h-4 w-16 animate-pulse rounded bg-line" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-line/70" />
              </div>
              <div className="h-29 w-29 animate-pulse rounded-[20px] bg-line/70" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
