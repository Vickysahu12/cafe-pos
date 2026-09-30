'use client';

// app/order/[slug]/page.tsx
// USE CASE: Customer QR menu — pehla page jo customer scan karke dekhta hai.
//
// UI/UX PASS (2026-09-30) — rebuilt on the shared design tokens (globals.css):
//  - FIX: "Table 12" HARDCODED tha — har customer ko har table pe "Table 12" dikhta.
//    Ab per-table QR (?table=<id>) se asli table, warna koi badge nahi (takeaway).
//  - FIX: back button hataya — QR se khula pehla page hai, "back" kahin nahi jaata tha.
//  - FSSAI VegMark (non-veg brown triangle, pehle laal dot), "Veg only" toggle
//  - Search (bade menu ke liye), category chips scroll ke saath active hote hain
//  - "from ₹X" = sabse sasta size (pehle pehla variant dikhta tha)
//  - 40px+ tap targets, 12px+ text, filler text/tilted "Good Food Good Mood" hataya
//  - Pichla order ho to upar "Track order #12" — tab band karke wapas aane pe bhi
//  - Cart bar mein GST ke saath asli total

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock3, MapPin, Search, UtensilsCrossed, X } from 'lucide-react';
import { publicMenuApi, type PublicMenu, type Product } from '@/lib/api';
import { useCartStore, useBindCartToOutlet, simpleKey } from '@/lib/cart-store';
import { billTotals, formatINR } from '@/lib/money';
import { ProductTile } from '@/lib/product-visual';
import { PoweredBy, QtyStepper, StateScreen, VegMark } from '@/components/ui';
import { ProductModal } from './ProductModal';

type FetchState = 'loading' | 'error' | 'ready';

// Table QR ka context itni der tak yaad rahe (baad mein counter pe aaye to takeaway)
const TABLE_TTL_MS = 3 * 60 * 60 * 1000;
const LAST_ORDER_TTL_MS = 6 * 60 * 60 * 1000;

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
    // Page khulte hi menu fetch — data-fetching effect, setState await ke BAAD hota hai (intentional)
     
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

  const totalProducts = menu?.categories.reduce((n, c) => n + c.products.length, 0) ?? 0;
  const hasVeg = menu?.categories.some((c) => c.products.some((p) => p.isVeg)) ?? false;
  const hasNonVeg = menu?.categories.some((c) => c.products.some((p) => !p.isVeg)) ?? false;

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
      { rootMargin: '-120px 0px -60% 0px' }
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
    <main className="min-h-dvh bg-paper pb-32">
      {/* Header */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-2xl items-start justify-between gap-3 px-4 pb-4 pt-5">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight text-ink">{menu.outlet.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <MapPin size={14} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{menu.outlet.address}</span>
            </p>
          </div>
          {table && (
            <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-sm font-bold text-brand">
              Table {table.tableNumber}
            </span>
          )}
        </div>

        {showTrackBanner && lastOrder && (
          <div className="mx-auto max-w-2xl px-4 pb-4">
            <Link
              href={`/order/${slug}/status/${lastOrder.id}`}
              className="flex items-center justify-between gap-3 rounded-2xl bg-brand px-4 py-3 text-white transition-colors hover:bg-brand-hover"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Clock3 size={16} aria-hidden="true" /> Your order #{lastOrder.orderNumber} is in progress
              </span>
              <span className="flex items-center gap-1 text-sm font-bold">
                Track <ArrowRight size={16} aria-hidden="true" />
              </span>
            </Link>
          </div>
        )}
      </header>

      {totalProducts === 0 ? (
        <div className="mx-auto max-w-2xl px-4 pt-16 text-center">
          <UtensilsCrossed size={28} className="mx-auto text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted">The menu isn&apos;t available right now — please ask the staff.</p>
        </div>
      ) : (
        <>
          {/* Sticky tools: search + veg + category chips */}
          <div className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
            <div className="mx-auto max-w-2xl px-4 pt-3">
              <div className="flex items-center gap-2">
                {totalProducts > 8 && (
                  <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-brand">
                    <Search size={18} className="shrink-0 text-muted" aria-hidden="true" />
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search the menu"
                      aria-label="Search the menu"
                      className="h-full w-full bg-transparent text-[15px] text-ink placeholder:text-muted focus:outline-none"
                    />
                    {query && (
                      <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="p-1 text-muted">
                        <X size={16} />
                      </button>
                    )}
                  </label>
                )}
                {hasVeg && hasNonVeg && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={vegOnly}
                    onClick={() => setVegOnly((v) => !v)}
                    className={`flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors ${
                      vegOnly ? 'border-veg bg-success-soft text-veg' : 'border-line bg-surface text-ink'
                    } ${totalProducts > 8 ? '' : 'ml-auto'}`}
                  >
                    <VegMark isVeg />
                    Veg only
                  </button>
                )}
              </div>
            </div>

            {visibleCategories.length > 1 && (
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
                        active ? 'bg-brand text-white' : 'border border-line bg-surface text-ink hover:border-brand/40'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </nav>
            )}
            {visibleCategories.length <= 1 && <div className="h-3" />}
          </div>

          {/* Menu */}
          <div className="mx-auto max-w-2xl px-4">
            {visibleCategories.length === 0 && (
              <p className="pt-12 text-center text-sm text-muted">
                No items match{query ? ` “${query}”` : ''}{vegOnly ? ' in veg' : ''}.
              </p>
            )}

            {visibleCategories.map((category) => (
              <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-36 pt-6" aria-labelledby={`h-${category.id}`}>
                <h2 id={`h-${category.id}`} className="mb-3 text-base font-extrabold text-ink">
                  {category.name}
                  <span className="ml-2 text-sm font-medium text-muted">{category.products.length}</span>
                </h2>

                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                  {category.products.map((product) => {
                    const qty = hasOptions(product) ? 0 : quantityFor(product.id);
                    return (
                      <li key={product.id} className="flex gap-3 p-4">
                        <ProductTile name={product.name} />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start gap-2">
                            <VegMark isVeg={product.isVeg} className="mt-0.75" />
                            <h3 className="text-[15px] font-bold leading-snug text-ink">{product.name}</h3>
                          </div>
                          {product.description && (
                            <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted">{product.description}</p>
                          )}
                          <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                            <div>
                              <p className="text-[15px] font-extrabold text-ink">
                                {product.variants.length > 1 && <span className="mr-1 text-sm font-medium text-muted">from</span>}
                                {formatINR(minPrice(product))}
                              </p>
                              {hasOptions(product) && <p className="text-xs text-muted">Customisable</p>}
                            </div>
                            {qty > 0 ? (
                              <QtyStepper
                                quantity={qty}
                                label={product.name}
                                onDecrement={() => decrementItem(simpleKey(product.id))}
                                onIncrement={() => incrementItem(simpleKey(product.id))}
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAdd(product)}
                                className="h-10 min-w-[84px] shrink-0 rounded-full border border-brand bg-surface px-5 text-sm font-bold text-brand transition-colors hover:bg-brand hover:text-white"
                                aria-label={`Add ${product.name}`}
                              >
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            <PoweredBy />
          </div>
        </>
      )}

      {modalProduct && <ProductModal product={modalProduct} onClose={() => setModalProduct(null)} />}

      {/* Cart bar */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <button
            type="button"
            onClick={() => router.push(`/order/${slug}/cart`)}
            className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between rounded-2xl bg-brand px-5 text-white transition-colors hover:bg-brand-hover"
          >
            <span className="text-left">
              <span className="block text-sm font-bold">
                {cartCount} item{cartCount > 1 ? 's' : ''} · {formatINR(cartTotal)}
              </span>
              <span className="block text-xs text-white/75">incl. GST</span>
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
      <div className="border-b border-line bg-surface px-4 pb-4 pt-5">
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="h-6 w-48 animate-pulse rounded-md bg-line" />
          <div className="h-4 w-64 animate-pulse rounded-md bg-line/70" />
        </div>
      </div>
      <div className="mx-auto max-w-2xl px-4">
        <div className="flex gap-2 py-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-line" />
          ))}
        </div>
        {[0, 1].map((i) => (
          <div key={i} className="pt-4">
            <div className="mb-3 h-5 w-32 animate-pulse rounded-md bg-line" />
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {[0, 1, 2].map((j) => (
                <div key={j} className="flex gap-3 p-4">
                  <div className="h-14 w-14 animate-pulse rounded-2xl bg-line/70" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-line" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-line/70" />
                    <div className="flex items-center justify-between pt-2">
                      <div className="h-4 w-14 animate-pulse rounded bg-line" />
                      <div className="h-10 w-20 animate-pulse rounded-full bg-line/70" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
