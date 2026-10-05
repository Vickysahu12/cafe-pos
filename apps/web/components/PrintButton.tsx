'use client';

// app/bill/[orderId]/PrintButton.tsx
// ADDED (2026-10-05): bill page ka "Save as PDF / Print" — browser ka print dialog kholta hai
// (Android Chrome pe "Save as PDF" option aata hai). Page baaki server-rendered hai,
// sirf yeh button client pe chalta hai (onClick ke liye).

import { Download } from 'lucide-react';

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.98]"
    >
      <Download size={18} aria-hidden="true" /> Save as PDF
    </button>
  );
}
