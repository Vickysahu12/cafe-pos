'use client';

// app/order/[slug]/page.tsx
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  Plus, 
  Minus, 
  AlertTriangle, 
  ArrowLeft, 
  Coffee, 
  MapPin, 
  CupSoda, 
  CakeSlice, 
  Utensils, 
  Heart, 
  ArrowRight, 
  Pizza, 
  Sandwich, 
  UtensilsCrossed, 
  Cookie
} from 'lucide-react';
import { publicMenuApi, type PublicMenu, type Product } from '@/lib/api';
import { useCartStore, useBindCartToOutlet } from '@/lib/cart-store';
import { ProductModal } from './ProductModal';

type FetchState = 'loading' | 'error' | 'ready';

function simpleKey(productId: string) {
  return `${productId}|base|`;
}

// Category Icon Helper with typo safety ('cofee' & 'coffee')
const getCategoryIcon = (catName: string, active: boolean) => {
  const name = catName.toLowerCase();
  const colorClass = active ? "text-white" : "text-[#134731]";
  
  if (name.includes('cof') || name.includes('tea') || name.includes('latte')) return <Coffee size={15} className={colorClass} />;
  if (name.includes('dessert') || name.includes('sweet') || name.includes('cake')) return <CakeSlice size={15} className={colorClass} />;
  if (name.includes('drink') || name.includes('beverage') || name.includes('soda')) return <CupSoda size={15} className={colorClass} />;
  return <Utensils size={15} className={colorClass} />;
};

// Premium Icon Avatar config for items (No image look)
const getProductAvatar = (productName: string) => {
  const name = productName.toLowerCase();

  if (name.includes('cof') || name.includes('tea') || name.includes('latte') || name.includes('espresso') || name.includes('cappuccino')) {
    return {
      icon: <Coffee size={24} className="text-[#C2410C]" />,
      bgGradient: "from-amber-100/80 via-orange-50 to-amber-50",
      circleBg: "bg-amber-200/50",
      borderColor: "border-amber-200/60"
    };
  }
  if (name.includes('brownie') || name.includes('dessert') || name.includes('cake') || name.includes('pastry') || name.includes('sweet')) {
    return {
      icon: <CakeSlice size={24} className="text-[#BE123C]" />,
      bgGradient: "from-rose-100/80 via-pink-50 to-rose-50",
      circleBg: "bg-rose-200/50",
      borderColor: "border-rose-200/60"
    };
  }
  if (name.includes('cookie') || name.includes('biscuit')) {
    return {
      icon: <Cookie size={24} className="text-[#B45309]" />,
      bgGradient: "from-yellow-100/80 via-amber-50 to-yellow-50",
      circleBg: "bg-yellow-200/50",
      borderColor: "border-yellow-200/60"
    };
  }
  if (name.includes('cola') || name.includes('drink') || name.includes('soda') || name.includes('juice') || name.includes('shake')) {
    return {
      icon: <CupSoda size={24} className="text-[#0369A1]" />,
      bgGradient: "from-sky-100/80 via-blue-50 to-cyan-50",
      circleBg: "bg-sky-200/50",
      borderColor: "border-sky-200/60"
    };
  }
  if (name.includes('pizza')) {
    return {
      icon: <Pizza size={24} className="text-[#C2410C]" />,
      bgGradient: "from-orange-100/80 via-amber-50 to-orange-50",
      circleBg: "bg-orange-200/50",
      borderColor: "border-orange-200/60"
    };
  }
  if (name.includes('burger') || name.includes('sandwich') || name.includes('toast')) {
    return {
      icon: <Sandwich size={24} className="text-[#D97706]" />,
      bgGradient: "from-amber-100/80 via-yellow-50 to-amber-50",
      circleBg: "bg-amber-200/50",
      borderColor: "border-amber-200/60"
    };
  }

  return {
    icon: <UtensilsCrossed size={24} className="text-[#134731]" />,
    bgGradient: "from-[#E5ECE9] via-emerald-50/50 to-green-50",
    circleBg: "bg-emerald-200/40",
    borderColor: "border-emerald-200/50"
  };
};

export default function MenuPage() {
  const { slug } = useParams<{ slug: string }>();
  useBindCartToOutlet(slug); // FIX (2026-09-29): cart sirf isi cafe ka (dekho lib/cart-store.ts)
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
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#FDFCF7] px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h1 className="text-base font-bold text-[#134731]">Couldn&apos;t load this menu</h1>
        <p className="mt-1 text-sm text-gray-500">Check your connection and try again.</p>
        <button
          onClick={loadMenu}
          className="mt-4 rounded-full bg-[#134731] px-6 py-2 text-sm font-semibold text-white active:bg-[#0d3322]"
        >
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFCF7] pb-32 font-sans relative">
      {/* Top Header */}
      <header className="sticky top-0 z-20 bg-[#FDFCF7]/95 backdrop-blur-md px-4 pb-3 pt-5 flex items-center justify-between border-b border-gray-100/60">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.back()} 
            className="p-2 bg-white rounded-full shadow-xs text-gray-700 border border-gray-100"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400">
              YOU&apos;RE ORDERING FROM
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="bg-[#F97316] text-white p-1 rounded-md shadow-2xs">
                <Coffee size={12} />
              </span>
              <h1 className="text-sm font-black text-[#134731] leading-none">{menu.outlet.name}</h1>
            </div>
            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 font-medium">
              <MapPin size={10} className="text-gray-400" /> {menu.outlet.address}
            </p>
          </div>
        </div>

        {/* Table Badge */}
        <div className="flex items-center gap-1.5 rounded-full bg-[#E5ECE9] px-3 py-1.5 text-xs font-bold text-[#134731] shadow-2xs border border-[#134731]/10">
          <Utensils size={12} />
          <span>Table 12</span>
        </div>
      </header>

      {menu.categories.length === 0 ? (
        <div className="px-5 pt-16 text-center">
          <p className="text-sm text-gray-500">This menu isn&apos;t available right now — please check with staff.</p>
        </div>
      ) : (
        <>
          {/* Category Navigation Pills */}
          {menu.categories.length > 1 && (
            <nav className="sticky top-[73px] z-10 flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar scroll-smooth bg-[#FDFCF7]/90 backdrop-blur-xs">
              {menu.categories.map((cat) => {
                const isActive = activeCategory === cat.id;
                return (
                  <a
                    key={cat.id}
                    href={`#cat-${cat.id}`}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-[#134731] text-white shadow-md shadow-[#134731]/20 scale-[1.02]'
                        : 'bg-white text-gray-600 border border-gray-100 shadow-2xs hover:bg-gray-50'
                    }`}
                  >
                    {getCategoryIcon(cat.name, isActive)}
                    {cat.name}
                  </a>
                );
              })}
            </nav>
          )}

          {/* Categories & Products */}
          <div className="px-4 mt-2 space-y-7">
            {menu.categories.map((category) => {
              const available = category.products.filter((p) => p.isAvailable);
              if (available.length === 0) return null;

              return (
                <section key={category.id} id={`cat-${category.id}`} className="scroll-mt-28">
                  {/* Category Title Header */}
                  <div className="flex items-center justify-between mb-3.5 px-1">
                    <div className="flex items-center gap-2.5">
                      <div className="bg-[#E5ECE9] p-2 rounded-xl text-[#134731]">
                        {getCategoryIcon(category.name, false)}
                      </div>
                      <div>
                        <h2 className="text-base font-extrabold text-[#134731] leading-tight">{category.name}</h2>
                        <p className="text-[10px] font-medium text-gray-400">Freshly prepared for you</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-gray-400 bg-white px-2.5 py-1 rounded-full border border-gray-100 shadow-2xs">
                      {available.length} items
                    </span>
                  </div>

                  {/* Product Cards */}
                  <div className="space-y-3">
                    {available.map((product) => {
                      const qty = product.variants.length === 0 && product.addons.length === 0
                        ? quantityFor(product.id)
                        : 0;

                      const avatar = getProductAvatar(product.name);

                      return (
                        <div 
                          key={product.id} 
                          className="flex items-center p-3.5 bg-white rounded-2xl shadow-2xs border border-gray-100/80 gap-3.5 hover:border-gray-200 transition-colors"
                        >
                          {/* Left: Compact Micro-Vector Avatar Badge */}
                          <div className={`relative shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${avatar.bgGradient} border ${avatar.borderColor} flex items-center justify-center shadow-2xs`}>
                            <div className={`w-10 h-10 rounded-full ${avatar.circleBg} flex items-center justify-center backdrop-blur-xs`}>
                              {avatar.icon}
                            </div>
                          </div>

                          {/* Right: Product Details & Action */}
                          <div className="flex flex-1 flex-col justify-between py-0.5 min-w-0">
                            <div>
                              {/* Veg / Non-Veg Indicator + Name (Zomato Style) */}
                              <div className="flex items-start gap-1.5">
                                <span className={`mt-0.5 flex shrink-0 h-3.5 w-3.5 items-center justify-center rounded-[3px] border ${product.isVeg ? 'border-green-600' : 'border-red-600'} bg-white p-[1px]`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${product.isVeg ? 'bg-green-600' : 'bg-red-600'}`} />
                                </span>
                                <h3 className="text-sm font-bold text-[#134731] leading-tight truncate">
                                  {product.name}
                                </h3>
                              </div>

                              {product.description && (
                                <p className="mt-1 text-[11px] leading-snug text-gray-400 line-clamp-1">
                                  {product.description}
                                </p>
                              )}
                            </div>

                            {/* Price & Add Button Row */}
                            <div className="flex items-center justify-between mt-2.5">
                              <div className="flex items-baseline gap-1">
                                <span className="text-sm font-black text-[#134731]">
                                  ₹{product.variants[0]?.price ?? product.price}
                                </span>
                                {product.variants.length > 1 && (
                                  <span className="text-[10px] font-medium text-gray-400">onwards</span>
                                )}
                              </div>

                              {/* Quantity Counter / Add Button */}
                              {qty > 0 ? (
                                <div className="flex shrink-0 items-center gap-2.5 rounded-full border border-[#134731] bg-[#134731] px-2.5 py-1 shadow-xs">
                                  <button onClick={() => decrementItem(simpleKey(product.id))} className="text-white hover:opacity-80 active:scale-90" aria-label="Remove">
                                    <Minus size={13} />
                                  </button>
                                  <span className="w-3 text-center text-xs font-bold text-white">{qty}</span>
                                  <button onClick={() => incrementItem(simpleKey(product.id))} className="text-white hover:opacity-80 active:scale-90" aria-label="Add">
                                    <Plus size={13} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleQuickAdd(product)}
                                  className="flex items-center gap-1 shrink-0 rounded-full bg-[#134731] px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-[#0e3625] active:scale-95 transition-all"
                                >
                                  Add <Plus size={13} />
                                </button>
                              )}
                            </div>
                          </div>
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

      {/* Footer Branding */}
      <div className="mt-12 flex w-full px-8 justify-start opacity-60">
        <div className="transform -rotate-6">
          <p className="text-base font-extrabold text-[#134731] italic leading-none">Good Food</p>
          <p className="text-base font-extrabold text-[#134731] italic flex items-center gap-1.5 mt-1 leading-none">
            Good Mood <Heart className="text-[#F97316] fill-[#F97316]" size={13} />
          </p>
          <div className="w-12 h-[2px] bg-[#134731] mt-1 ml-0.5 rounded-full"></div>
        </div>
      </div>

      {/* Floating Bottom Cart Pill */}
      {cartCount > 0 && (
        <div className="fixed bottom-5 inset-x-0 flex justify-center z-30 px-5">
          <button
            onClick={() => router.push(`/order/${slug}/cart`)}
            className="flex items-center justify-between w-full max-w-md rounded-full bg-[#134731] text-white px-5 py-3 shadow-xl transition-all active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-extrabold">
                {cartCount}
              </span>
              <span className="text-xs font-semibold tracking-wide uppercase text-white/80">
                Item{cartCount > 1 ? 's' : ''} added
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold">₹{cartTotal}</span>
              <span className="text-xs font-bold bg-white text-[#134731] px-3 py-1 rounded-full flex items-center gap-1 ml-1 shadow-2xs">
                View Cart <ArrowRight size={13} />
              </span>
            </div>
          </button>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </main>
  );
}

function MenuSkeleton() {
  return (
    <main className="min-h-screen bg-[#FDFCF7] px-4 pt-5">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
        <div className="h-3 w-28 animate-pulse rounded bg-gray-200" />
        <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
      </div>
      
      <div className="flex gap-2 mb-6 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 w-24 shrink-0 animate-pulse rounded-full bg-gray-200" />
        ))}
      </div>

      {[0, 1].map((i) => (
        <div key={i} className="mb-6">
          <div className="mb-3 h-5 w-28 animate-pulse rounded bg-gray-200" />
          {[0, 1].map((j) => (
            <div key={j} className="flex gap-3.5 p-3.5 bg-white rounded-2xl border border-gray-100 mb-3 items-center">
              <div className="h-16 w-16 animate-pulse rounded-2xl bg-gray-100 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
                <div className="mt-3 flex justify-between items-center">
                  <div className="h-4 w-10 animate-pulse rounded bg-gray-200" />
                  <div className="h-7 w-16 animate-pulse rounded-full bg-gray-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </main>
  );
}