'use client';

// app/order/[slug]/status/[orderId]/page.tsx
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  AlertTriangle, 
  ArrowLeft, 
  Check, 
  ChefHat, 
  Clock, 
  ShoppingBag, 
  XCircle, 
  ShieldCheck, 
  Coffee, 
  CupSoda, 
  Pizza, 
  Sandwich, 
  CakeSlice, 
  Cookie, 
  UtensilsCrossed 
} from 'lucide-react';
import { publicMenuApi, type PublicOrderStatus } from '@/lib/api';

type FetchState = 'loading' | 'error' | 'ready';

const STEPS = [
  { key: 'PENDING', label: 'Placed', icon: Check },
  { key: 'PREPARING', label: 'Preparing', icon: ChefHat },
  { key: 'READY', label: 'Ready', icon: Clock },
  { key: 'SERVED', label: 'Served', icon: ShoppingBag },
];

const TERMINAL_STATUSES = ['SERVED', 'CANCELLED'];

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  PREPARING: 'Preparing',
  READY: 'Ready',
};

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

export default function OrderStatusPage() {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const router = useRouter();

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
      <main className="flex min-h-screen items-center justify-center bg-[#FDFCF7]">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-emerald-200 border-t-[#134731]" />
      </main>
    );
  }

  if (state === 'error' || !order) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#FDFCF7] px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-500 shadow-2xs">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-base font-extrabold text-[#134731]">Couldn&apos;t load your order</h1>
        <p className="mt-1 text-xs font-medium text-gray-500">Check your connection — we&apos;ll keep trying automatically.</p>
        <button
          onClick={() => router.push(`/order/${slug}`)}
          className="mt-6 rounded-full bg-[#134731] px-6 py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition-all"
        >
          Back to Menu
        </button>
      </main>
    );
  }

  if (order.orderStatus === 'CANCELLED') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#FDFCF7] px-6 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 shadow-2xs">
          <XCircle className="h-6 w-6" />
        </div>
        <h1 className="text-base font-extrabold text-[#134731]">Order #{order.orderNumber} was cancelled</h1>
        <p className="mt-1 text-xs font-medium text-gray-500">Please check with staff at the counter.</p>
        <button
          onClick={() => router.push(`/order/${slug}`)}
          className="mt-6 rounded-full bg-[#134731] px-6 py-2.5 text-xs font-bold text-white shadow-md active:scale-95 transition-all"
        >
          Back to Menu
        </button>
      </main>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.key === order.orderStatus);

  return (
    <main className="min-h-screen bg-[#FDFCF7] pb-16 font-sans relative">
      {/* 1. Header Bar */}
      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <button 
          onClick={() => router.push(`/order/${slug}`)} 
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-gray-700 shadow-2xs border border-gray-100 hover:bg-gray-50 active:scale-95 transition-all"
          aria-label="Back to menu"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="text-center flex-1 mx-2">
          <p className="text-xs font-semibold text-gray-400">Order #{order.orderNumber}</p>
          <h1 className="text-2xl font-black text-[#134731] tracking-tight relative inline-block mt-0.5">
            {order.orderStatus === 'SERVED' ? 'Enjoy your order!' : "We're on it"}
            {order.orderStatus !== 'SERVED' && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-8 h-1 bg-[#F97316] rounded-full" />
            )}
          </h1>
          <p className="text-[11px] font-medium text-gray-400 mt-1.5">
            Your food is being prepared with care <span className="text-[#F97316]">🧡</span>
          </p>
        </div>

        {/* Top Right Handwritten Style Badge */}
        <div className="text-right shrink-0">
          <span className="font-serif italic font-extrabold text-sm text-[#134731] tracking-tight block leading-tight">
            Good Food
          </span>
          <span className="font-serif italic font-extrabold text-sm text-[#134731] tracking-tight flex items-center justify-end gap-1 leading-tight">
            Good Mood <span className="text-[#F97316] not-italic text-xs">🧡</span>
          </span>
        </div>
      </header>

      {/* 2. Step Progress Tracker Bar */}
      <div className="mx-auto mt-8 max-w-md px-6">
        <div className="flex items-center justify-between relative">
          {STEPS.map((step, i) => {
            const done = i <= (currentIndex >= 0 ? currentIndex : 0);
            const isLast = i === STEPS.length - 1;
            const StepIcon = step.icon;

            return (
              <div key={step.key} className="flex flex-1 items-center last:flex-none relative">
                <div className="flex flex-col items-center z-10 mx-auto">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full transition-all ${
                      done 
                        ? 'bg-[#134731] text-white shadow-md shadow-[#134731]/20 ring-4 ring-[#FDFCF7]' 
                        : 'bg-stone-200/70 text-gray-600 ring-4 ring-[#FDFCF7]'
                    }`}
                  >
                    {done ? <Check size={18} strokeWidth={3} /> : <StepIcon size={18} />}
                  </div>
                  <span className={`mt-2 text-center text-xs font-extrabold ${done ? 'text-[#134731]' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>

                {!isLast && (
                  <div 
                    className={`absolute top-5 left-[50%] right-[-50%] h-[2px] -z-0 transition-all ${
                      i < currentIndex ? 'bg-[#134731]' : 'bg-stone-200'
                    }`} 
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-5 mt-8 space-y-4 max-w-md mx-auto">
        {/* 3. Items Status Card */}
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-2xs">
          {order.items.map((item) => {
            const avatar = getProductAvatar(item.product.name);

            return (
              <div key={item.id} className="flex items-center gap-3 py-1">
                {/* Product Avatar */}
                <div className={`relative shrink-0 w-14 h-14 rounded-2xl bg-gradient-to-br ${avatar.bgGradient} border ${avatar.borderColor} flex items-center justify-center shadow-2xs`}>
                  <div className={`w-9 h-9 rounded-full ${avatar.circleBg} flex items-center justify-center backdrop-blur-xs`}>
                    {avatar.icon}
                  </div>
                </div>

                {/* Title & Description */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-extrabold text-[#134731] truncate">
                    {item.product.name}
                  </h3>
                  <p className="text-[11px] font-medium text-gray-400 truncate mt-0.5">
                    Chilled. Fizzy and refreshing.
                  </p>
                  <p className="text-xs font-black text-[#134731] mt-1">
                    {item.quantity} × ₹{order.netAmount}
                  </p>
                </div>

                {/* Item Status Green Pill */}
                <div className="shrink-0">
                  <span className="inline-flex items-center rounded-full bg-emerald-100/70 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/50">
                    {ITEM_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 4. Total & Payment Info Card */}
        <div className="bg-white rounded-3xl p-4 border border-gray-100 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-500">Total</span>
            <span className="text-2xl font-black text-[#134731]">
              ₹{order.netAmount}
            </span>
          </div>

          {/* Light Blue Pay at Counter Info Box */}
          <div className="flex items-start gap-3 rounded-2xl bg-sky-50/70 border border-sky-100 p-3 text-sky-900">
            <div className="p-1.5 bg-sky-100 rounded-xl text-sky-600 shrink-0 mt-0.5">
              <ChefHat size={16} />
            </div>
            <p className="text-xs font-semibold leading-relaxed text-sky-900/90">
              Pay at the counter by cash or UPI when your order is served.
            </p>
          </div>
        </div>

        {/* 5. Bottom Trust Badge & Cute Illustration */}
        <div className="pt-4 pb-2 flex items-end justify-between">
          <div className="flex items-start gap-2 max-w-[200px]">
            <div className="p-1 text-emerald-700 bg-emerald-100/60 rounded-lg shrink-0 mt-0.5">
              <ShieldCheck size={16} />
            </div>
            <div>
              <p className="text-xs font-extrabold text-[#134731] leading-tight">
                Freshly made,
              </p>
              <p className="text-xs font-extrabold text-[#134731] flex items-center gap-1 leading-tight">
                just for you <span className="text-[#F97316]">🧡</span>
              </p>
            </div>
          </div>

          {/* Cute Drink Vector Illustration */}
          <div className="relative text-[#134731]">
            <div className="text-3xl animate-pulse">🥤</div>
            <span className="absolute -top-2 -right-1 text-xs">✨</span>
          </div>
        </div>

        {/* 6. Footer Order Tracking Tag */}
        <div className="flex items-center justify-center gap-2 pt-2">
          <div className="h-6 w-6 rounded-full bg-black text-white flex items-center justify-center text-[10px] font-black">
            N
          </div>
          <span className="text-xs font-bold text-gray-400 tracking-wide">
            Order Tracking
          </span>
        </div>
      </div>
    </main>
  );
}