'use client';

// app/order/[slug]/cart/page.tsx
import { useParams, useRouter } from 'next/navigation';
import { 
  Minus, 
  Plus, 
  Trash2, 
  ShoppingBag, 
  ArrowLeft, 
  Coffee, 
  Lock, 
  ArrowRight, 
  Info,
  CakeSlice, 
  CupSoda, 
  Pizza, 
  Sandwich, 
  Cookie, 
  UtensilsCrossed 
} from 'lucide-react';
import { useCartStore, useBindCartToOutlet } from '@/lib/cart-store';

// Smart Micro-Vector Avatar Generator (Image missing fallback)
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

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  useBindCartToOutlet(slug); // FIX (2026-09-29): cart sirf isi cafe ka (dekho lib/cart-store.ts)
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);
  const removeItem = useCartStore((s) => s.removeItem);

  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  if (items.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#FDFCF7] px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E5ECE9] text-[#134731] shadow-2xs">
          <ShoppingBag className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-black text-[#134731]">Your cart is empty</h1>
        <p className="mt-1 text-xs font-medium text-gray-500">Add something delicious from the menu to get started.</p>
        <button
          onClick={() => router.push(`/order/${slug}`)}
          className="mt-6 rounded-full bg-[#134731] px-6 py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition-all"
        >
          Browse Menu
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFCF7] pb-44 font-sans relative">
      {/* 1. Page Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-4 bg-[#FDFCF7]">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push(`/order/${slug}`)} 
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-700 shadow-2xs border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all"
            aria-label="Back to menu"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-[#134731] tracking-tight leading-tight">Your Order</h1>
            <p className="text-xs font-medium text-gray-500 flex items-center gap-1 mt-0.5">
              Good food, better mood <span className="text-[#F97316]">🧡</span>
            </p>
          </div>
        </div>

        {/* Top Right Orange Coffee Icon Badge */}
        <div className="p-2 text-[#F97316] bg-orange-50/60 rounded-2xl border border-orange-100/80">
          <Coffee size={22} />
        </div>
      </header>

      {/* 2. Cart Items List */}
      <div className="px-5 mt-2 space-y-3.5">
        {items.map((item) => {
          const subtitleParts = [item.variantName, ...item.addonNames].filter(Boolean);
          const avatar = getProductAvatar(item.productName);

          return (
            <div 
              key={item.key} 
              className="flex items-center p-3.5 bg-white rounded-2xl shadow-2xs border border-gray-100/90 gap-3.5 relative"
            >
              {/* Left: Product Icon Avatar Container */}
              <div className={`relative shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br ${avatar.bgGradient} border ${avatar.borderColor} flex items-center justify-center shadow-2xs`}>
                <div className={`w-10 h-10 rounded-full ${avatar.circleBg} flex items-center justify-center backdrop-blur-xs`}>
                  {avatar.icon}
                </div>
              </div>

              {/* Center: Title, Addons, Notes, Price */}
              <div className="flex-1 min-w-0 pr-2">
                <h3 className="text-sm font-bold text-[#134731] leading-snug truncate">
                  {item.productName}
                </h3>
                
                {subtitleParts.length > 0 && (
                  <p className="mt-0.5 text-[11px] font-medium text-gray-400 truncate">
                    {subtitleParts.join(' · ')}
                  </p>
                )}

                {item.notes && (
                  <p className="mt-0.5 text-[10px] italic text-gray-400 truncate">
                    &ldquo;{item.notes}&rdquo;
                  </p>
                )}

                <p className="mt-1.5 text-sm font-black text-[#134731]">
                  ₹{item.unitPrice * item.quantity}
                </p>
              </div>

              {/* Right Side: Trash Icon + Soft Beige Quantity Pill */}
              <div className="flex shrink-0 flex-col items-end justify-between h-full py-0.5 gap-2">
                {/* Trash Button */}
                <button 
                  onClick={() => removeItem(item.key)} 
                  className="text-[#E11D48]/70 hover:text-[#E11D48] transition-colors p-1" 
                  aria-label="Remove item"
                >
                  <Trash2 size={16} />
                </button>

                {/* Soft Beige Quantity Pill Controller */}
                <div className="flex items-center gap-2.5 rounded-full bg-[#F5F3EB] px-3 py-1 border border-gray-200/50">
                  <button 
                    onClick={() => decrementItem(item.key)} 
                    className="text-gray-700 hover:text-black active:scale-90 transition-transform" 
                    aria-label="Decrease quantity"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-3 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
                  <button 
                    onClick={() => incrementItem(item.key)} 
                    className="text-gray-700 hover:text-black active:scale-90 transition-transform" 
                    aria-label="Increase quantity"
                  >
                    <Plus size={13} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Bottom Fixed Total & Checkout Section */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#FDFCF7]/95 backdrop-blur-md px-5 pt-3 pb-6 border-t border-gray-100">
        <div className="max-w-md mx-auto space-y-3">
          
          {/* Estimated Total Card */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-2xs flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
                <span>Estimated total</span>
                <Info size={13} className="text-gray-400" />
              </div>
              <p className="text-[11px] font-medium text-gray-400 mt-0.5">
                Taxes calculated at checkout.
              </p>
            </div>
            <span className="text-2xl font-black text-[#134731]">
              ₹{subtotal}
            </span>
          </div>

          {/* Secure Proceed to Checkout Button */}
          <button
            onClick={() => router.push(`/order/${slug}/checkout`)}
            className="w-full flex items-center justify-between rounded-full bg-[#134731] hover:bg-[#0d3322] px-5 py-3.5 text-white shadow-xl shadow-[#134731]/15 active:scale-98 transition-all"
          >
            <Lock size={18} className="text-white/80" />
            <span className="text-sm font-extrabold tracking-wide">
              Proceed to Checkout
            </span>
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-[#F97316] text-white shadow-xs">
              <ArrowRight size={16} />
            </div>
          </button>
        </div>
      </div>
    </main>
  );
}