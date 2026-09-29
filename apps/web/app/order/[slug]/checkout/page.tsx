'use client';

// app/order/[slug]/checkout/page.tsx
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Wallet, 
  ShieldCheck, 
  Lock, 
  ArrowRight, 
  Minus, 
  Plus, 
  Coffee, 
  CupSoda, 
  Pizza, 
  Sandwich, 
  CakeSlice, 
  Cookie, 
  UtensilsCrossed 
} from 'lucide-react';
import { publicMenuApi, type OrderItemPayload } from '@/lib/api';
import { useCartStore, useBindCartToOutlet } from '@/lib/cart-store';

// Smart Micro-Vector Avatar Generator (Fallback when product image is not present)
const getProductAvatar = (productName: string) => {
  const name = productName.toLowerCase();

  if (name.includes('cof') || name.includes('tea') || name.includes('latte') || name.includes('espresso') || name.includes('cappuccino')) {
    return {
      icon: <Coffee size={22} className="text-[#C2410C]" />,
      bgGradient: "from-amber-100/80 via-orange-50 to-amber-50",
      circleBg: "bg-amber-200/50",
      borderColor: "border-amber-200/60"
    };
  }
  if (name.includes('brownie') || name.includes('dessert') || name.includes('cake') || name.includes('pastry')) {
    return {
      icon: <CakeSlice size={22} className="text-[#BE123C]" />,
      bgGradient: "from-rose-100/80 via-pink-50 to-rose-50",
      circleBg: "bg-rose-200/50",
      borderColor: "border-rose-200/60"
    };
  }
  if (name.includes('cookie') || name.includes('biscuit')) {
    return {
      icon: <Cookie size={22} className="text-[#B45309]" />,
      bgGradient: "from-yellow-100/80 via-amber-50 to-yellow-50",
      circleBg: "bg-yellow-200/50",
      borderColor: "border-yellow-200/60"
    };
  }
  if (name.includes('cola') || name.includes('drink') || name.includes('soda') || name.includes('juice') || name.includes('shake')) {
    return {
      icon: <CupSoda size={22} className="text-[#0369A1]" />,
      bgGradient: "from-sky-100/80 via-blue-50 to-cyan-50",
      circleBg: "bg-sky-200/50",
      borderColor: "border-sky-200/60"
    };
  }
  if (name.includes('pizza')) {
    return {
      icon: <Pizza size={22} className="text-[#C2410C]" />,
      bgGradient: "from-orange-100/80 via-amber-50 to-orange-50",
      circleBg: "bg-orange-200/50",
      borderColor: "border-orange-200/60"
    };
  }
  if (name.includes('burger') || name.includes('sandwich') || name.includes('toast')) {
    return {
      icon: <Sandwich size={22} className="text-[#D97706]" />,
      bgGradient: "from-amber-100/80 via-yellow-50 to-amber-50",
      circleBg: "bg-amber-200/50",
      borderColor: "border-amber-200/60"
    };
  }

  return {
    icon: <UtensilsCrossed size={22} className="text-[#134731]" />,
    bgGradient: "from-[#E5ECE9] via-emerald-50/50 to-green-50",
    circleBg: "bg-emerald-200/40",
    borderColor: "border-emerald-200/50"
  };
};

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  useBindCartToOutlet(slug); // FIX (2026-09-29): cart sirf isi cafe ka (dekho lib/cart-store.ts)
  const router = useRouter();

  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const handlePlaceOrder = async () => {
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

      const order = await publicMenuApi.createOrder(slug, { orderType: 'TAKEAWAY', items: payload });
      clearCart();
      router.replace(`/order/${slug}/status/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place your order. Please try again.');
      setPlacing(false);
    }
  };

  if (items.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#FDFCF7] px-6 text-center">
        <p className="text-sm font-semibold text-gray-500">Your cart is empty.</p>
        <button
          onClick={() => router.push(`/order/${slug}`)}
          className="mt-4 rounded-full bg-[#134731] px-6 py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition-all"
        >
          Browse Menu
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDFCF7] pb-44 font-sans relative">
      {/* 1. Header Section */}
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <div className="flex items-start gap-3">
          <button 
            onClick={() => router.push(`/order/${slug}/cart`)} 
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-2xs border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all mt-0.5"
            aria-label="Back to cart"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold text-[#134731] tracking-tight leading-tight">Confirm Order</h1>
            <p className="text-xs font-medium text-gray-400 mt-0.5">
              Review your items and payment method
            </p>
          </div>
        </div>

        {/* Top Right Handwritten Tag / Illustration */}
        <div className="text-right shrink-0">
          <span className="font-serif italic font-extrabold text-sm text-[#134731] tracking-tight block leading-tight">
            Good Food
          </span>
          <span className="font-serif italic font-extrabold text-sm text-[#134731] tracking-tight flex items-center justify-end gap-1 leading-tight">
            Good Mood <span className="text-[#F97316] not-italic text-xs">🧡</span>
          </span>
        </div>
      </header>

      <div className="px-5 mt-4 space-y-4">
        {/* 2. Order Items Card */}
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-2xs">
          <div className="mb-3">
            <h2 className="text-base font-extrabold text-[#134731]">Order Items</h2>
            <p className="text-xs font-medium text-gray-400 mt-0.5">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {items.map((item) => {
              const avatar = getProductAvatar(item.productName);
              const subtitleParts = [item.variantName, ...item.addonNames].filter(Boolean);

              return (
                <div key={item.key} className="py-3.5 flex items-center gap-3">
                  {/* Item Icon Avatar */}
                  <div className={`relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${avatar.bgGradient} border ${avatar.borderColor} flex items-center justify-center shadow-2xs`}>
                    <div className={`w-9 h-9 rounded-full ${avatar.circleBg} flex items-center justify-center backdrop-blur-xs`}>
                      {avatar.icon}
                    </div>
                  </div>

                  {/* Title & Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-[#134731] truncate">
                      {item.productName}
                    </h3>
                    <p className="text-[11px] font-medium text-gray-400 truncate mt-0.5">
                      {subtitleParts.length > 0 ? subtitleParts.join(' · ') : (item.notes || 'Chilled. Fizzy and refreshing.')}
                    </p>
                  </div>

                  {/* Quantity Controller Pill & Price */}
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-2 rounded-full bg-[#F5F3EB] px-2.5 py-1 border border-gray-200/50">
                      <button 
                        onClick={() => decrementItem(item.key)} 
                        className="text-gray-700 hover:text-black active:scale-90 transition-transform"
                        aria-label="Decrease quantity"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="w-3 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
                      <button 
                        onClick={() => incrementItem(item.key)} 
                        className="text-gray-700 hover:text-black active:scale-90 transition-transform"
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <span className="text-sm font-black text-[#134731] min-w-[36px] text-right">
                      ₹{item.unitPrice * item.quantity}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subtotal / Estimated Total Footer inside Card */}
          <div className="pt-3.5 mt-1 border-t border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-600">Estimated total</p>
              <p className="text-[10px] font-medium text-gray-400 mt-0.5">
                Final amount (with tax) will be confirmed on your order.
              </p>
            </div>
            <span className="text-xl font-black text-[#134731]">
              ₹{subtotal}
            </span>
          </div>
        </div>

        {/* 3. Payment Method Card */}
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-2xs">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#134731] text-white">
              <Wallet size={18} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#134731]">Payment Method</h2>
              <p className="text-xs font-medium text-gray-400">Choose how you want to pay</p>
            </div>
          </div>

          {/* Pay at Counter Selected Card */}
          <div className="rounded-2xl border-2 border-emerald-600/30 bg-emerald-50/20 p-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <Wallet size={20} />
              </div>
              <div>
                <p className="text-xs font-extrabold text-[#134731]">Pay at Counter</p>
                <p className="text-[11px] font-medium text-gray-500 mt-0.5 max-w-[200px] leading-tight">
                  Settle by cash or UPI, with staff when your order arrives.
                </p>
              </div>
            </div>

            {/* Selected Radio Button */}
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[#134731] p-0.5">
              <div className="h-2.5 w-2.5 rounded-full bg-[#134731]" />
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 shadow-2xs">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* 4. Trust Badge & Illustration */}
        <div className="pt-2 pb-4 flex items-end justify-between">
          <div className="flex items-start gap-2 max-w-[220px]">
            <div className="p-1 text-emerald-700 bg-emerald-100/60 rounded-lg shrink-0 mt-0.5">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="text-xs font-extrabold text-[#134731]">Your order is safe with us</p>
              <p className="text-[10px] font-medium text-gray-400">Secure & easy payment process</p>
            </div>
          </div>

          {/* Cute Drink Vector Illustration Placeholder */}
          <div className="relative text-[#134731]">
            <div className="text-2xl animate-bounce">🥤</div>
            <span className="absolute -top-2 -right-1 text-xs">✨</span>
          </div>
        </div>
      </div>

      {/* 5. Bottom Fixed Place Order Action Button */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#FDFCF7]/95 backdrop-blur-md px-5 pt-3 pb-6 border-t border-gray-100">
        <div className="max-w-md mx-auto">
          <button
            onClick={handlePlaceOrder}
            disabled={placing}
            className="w-full flex items-center justify-between rounded-full bg-[#134731] hover:bg-[#0d3322] px-5 py-3.5 text-white shadow-xl shadow-[#134731]/15 active:scale-98 transition-all disabled:opacity-60"
          >
            <Lock size={18} className="text-white/80" />
            
            <span className="text-sm font-extrabold tracking-wide">
              {placing ? 'Placing your order…' : `Place Order · ₹${subtotal}`}
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