// app/order/[slug]/cart/loading.tsx
// FIX (2026-10-16): "View cart" tap ke turant baad yeh dikhta hai (Next ka loading boundary) jab tak
// cart page load ho — pehle tap pe screen jaisi ki taisi rehti thi aur customer 3-4 baar dabata tha.

import { Loader2 } from 'lucide-react';

export default function CartLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper" aria-busy="true">
      <Loader2 size={28} className="animate-spin text-brand" aria-label="Opening your cart" />
    </main>
  );
}
