'use client';

// app/order/[slug]/page.tsx
// USE CASE: The customer's first screen after scanning the table QR code — browse
// this outlet's menu and add items to cart. No login, no app install.
// CONNECTED TO: lib/api.ts (publicMenuApi), lib/cart-store.ts, ./ProductModal.tsx.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Minus, ShoppingBag, AlertTriangle } from 'lucide-react';
import { publicMenuApi, type PublicMenu, type Product } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { ProductModal } from './ProductModal';

type FetchState = 'loading' | 'error' | 'ready';

// Simple products (no variant/addon choice) are keyed this way in the cart —
// must match buildKey()'s output in cart-store.ts for a bare product.
function simpleKey(productId: string) {
  return `${productId}|base|`;
}

export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [state, setState] = useState<FetchState>('loading');
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);

  const loadMenu = async () => {
    setState('loading');
    try {
      const data = await publicMenuApi.getMenu(slug);
      setMenu(data);
      setActiveCategory(data.categories[0]?.id ?? null);
      setState('ready');
    } catch {
      setState('error');
    }
  };

  useEffect(() => {
    loadMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const quantityFor = (productId: string) => {
    const line = items.find((i) => i.key === simpleKey(productId));
    return line?.quantity ?? 0;
  };

  const handleQuickAdd = (product: Product) => {
    // Products with variants/addons need a choice made first — open the modal
    // instead of guessing a price for them.
    if (product.variants.length > 0 || product.addons.length > 0) {
      setModalProduct(product);
      return;
    }
    addItem(product, null, [], 1);
  };

  if (state === 'loading') {
    return <MenuSkeleton />;
  }

  if (state === 'error' || !menu) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h1 className="text-base font-semibold text-ink">Couldn&apos;t load this menu</h1>
        <p className="mt-1 text-sm text-muted">Check your connection and try again.</p>
        <button
          onClick={loadMenu}
          className="mt-4 rounded-full bg-brand px-6 py-2 text-sm font-semibold text-white active:bg-brand-dark"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-28">
      {/* Outlet header */}
      <header className="border-b border-line bg-white px-5 pb-4 pt-6">
        <p className="text-xs font-medium text-muted">You&apos;re ordering from</p>
        <h1 className="mt-1 text-lg font-bold text-ink">{menu.outlet.name}</h1>
        <p className="text-sm text-muted">{menu.outlet.address}</p>
      </header>

      {menu.categories.length === 0 ? (
        <div className="px-5 pt-16 text-center">
          <p className="text-sm text-muted">This menu isn&apos;t available right now — please check with staff.</p>
        </div>
      ) : (
        <>
          {/* Category jump nav */}
          {menu.categories.length > 1 && (
            <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-line bg-paper px-5 py-3">
              {menu.categories.map((cat) => (
                <a
                  key={cat.id}
                  href={`#cat-${cat.id}`}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-brand text-white'
                      : 'border border-line bg-white text-muted'
                  }`}
                >
                  {cat.name}
                </a>
              ))}
            </nav>
          )}

          {/* Categories + products */}
          <div className="px-5">
            {menu.categories.map((category) => {
              const available = category.products.filter((p) => p.isAvailable);
              if (available.length === 0) return null;

              return (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-16 pt-6">
                  <h2 className="mb-1 text-base font-bold text-ink">{category.name}</h2>
                  <div className="divide-y divide-line">
                    {available.map((product) => {
                      const qty = product.variants.length === 0 && product.addons.length === 0
                        ? quantityFor(product.id)
                        : 0;

                      return (
                        <div key={product.id} className="flex items-start justify-between gap-4 py-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${
                                  product.isVeg ? 'border-veg' : 'border-nonveg'
                                }`}
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${product.isVeg ? 'bg-veg' : 'bg-nonveg'}`} />
                              </span>
                              <h3 className="text-sm font-semibold text-ink">{product.name}</h3>
                            </div>
                            {product.description && (
                              <p className="mt-1 text-xs leading-relaxed text-muted">{product.description}</p>
                            )}
                            <p className="mt-2 text-sm font-semibold text-ink">
                              ₹{product.variants[0]?.price ?? product.price}
                              {product.variants.length > 1 && (
                                <span className="ml-1 text-xs font-normal text-muted">onwards</span>
                              )}
                            </p>
                          </div>

                          {qty > 0 ? (
                            <div className="flex shrink-0 items-center gap-3 rounded-full border border-brand bg-brand-light px-2 py-1">
                              <button onClick={() => decrementItem(simpleKey(product.id))} className="text-brand" aria-label="Remove one">
                                <Minus size={14} />
                              </button>
                              <span className="w-4 text-center text-sm font-semibold text-brand">{qty}</span>
                              <button onClick={() => incrementItem(simpleKey(product.id))} className="text-brand" aria-label="Add one more">
                                <Plus size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleQuickAdd(product)}
                              className="shrink-0 rounded-full border border-brand px-4 py-1.5 text-sm font-semibold text-brand active:bg-brand-light"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {modalProduct && <ProductModal product={modalProduct} onClose={() => setModalProduct(null)} />}

      {/* Sticky cart bar — only appears once something's been added */}
      {cartCount > 0 && (
        <button
          onClick={() => router.push(`/order/${slug}/cart`)}
          className="fixed inset-x-4 bottom-4 z-20 flex items-center justify-between rounded-2xl bg-ink px-5 py-4 text-white shadow-lg"
        >
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ShoppingBag size={18} />
            {cartCount} item{cartCount > 1 ? 's' : ''}
          </span>
          <span className="text-sm font-bold">View Cart · ₹{cartTotal}</span>
        </button>
      )}
    </main>
  );
}

function MenuSkeleton() {
  return (
    <main className="min-h-screen px-5 pt-6">
      <div className="mb-6 space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-line" />
        <div className="h-5 w-40 animate-pulse rounded bg-line" />
        <div className="h-3 w-56 animate-pulse rounded bg-line" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="mb-6">
          <div className="mb-3 h-4 w-24 animate-pulse rounded bg-line" />
          {[0, 1].map((j) => (
            <div key={j} className="flex items-center justify-between py-4">
              <div className="space-y-2">
                <div className="h-3 w-32 animate-pulse rounded bg-line" />
                <div className="h-3 w-20 animate-pulse rounded bg-line" />
              </div>
              <div className="h-8 w-16 animate-pulse rounded-full bg-line" />
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}