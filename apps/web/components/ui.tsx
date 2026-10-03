// components/ui.tsx
// USE CASE (2026-09-30): Customer site ke chhote shared UI pieces — har page pe ek jaisa
// dikhe aur behave kare (pehle har page ne apna stepper/veg-mark/error-screen banaya tha).
//   - VegMark: India ka FSSAI symbol (green dot / brown triangle)
//   - QtyStepper: +/- with 40px+ tap targets (pehle 13px icons the — phone pe miss hote)
//   - StateScreen: full-page empty/error state with one clear action
//   - PoweredBy: subtle footer brand mark
//
// REDESIGN (2026-10-02): landing jaisa espresso brand.
//   - AddButton: photo slot ke neeche aadha bahar latka "ADD" (Swiggy/Zomato wala pattern —
//     Indian customer isse pehle se jaanta hai, sochna nahi padta)
//   - QtyStepper `size="sm"` — card pe ADD ki jagah same size mein aata hai (layout hilta nahi)
//   - Monogram: cafe ka logo abhi nahi hai → naam ke initials (V2: logo upload)
//   - Press feedback: active:scale-[0.97] — tap "mehsoos" ho

import Link from 'next/link';
import { Minus, Plus, type LucideIcon } from 'lucide-react';

export function VegMark({ isVeg, className = '' }: { isVeg: boolean; className?: string }) {
  return (
    <span
      role="img"
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white ${
        isVeg ? 'border-veg' : 'border-nonveg'
      } ${className}`}
    >
      {isVeg ? (
        <span className="h-[7px] w-[7px] rounded-full bg-veg" />
      ) : (
        <span className="h-0 w-0 border-x-[4px] border-b-[7px] border-x-transparent border-b-nonveg" />
      )}
    </span>
  );
}

interface QtyStepperProps {
  quantity: number;
  onDecrement: () => void;
  onIncrement: () => void;
  label: string;
  max?: number;
  variant?: 'solid' | 'soft';
  size?: 'sm' | 'md';
}

export function QtyStepper({ quantity, onDecrement, onIncrement, label, max = 100, variant = 'solid', size = 'md' }: QtyStepperProps) {
  const solid = variant === 'solid';
  const shell = solid ? 'bg-brand text-white shadow-[0_6px_16px_-6px_rgb(43_31_20/0.55)]' : 'bg-surface text-ink border border-line-strong';
  const btn = solid ? 'hover:bg-white/10 active:bg-white/15' : 'hover:bg-paper active:bg-brand-soft';
  const h = size === 'sm' ? 'h-9' : 'h-11';
  const w = size === 'sm' ? 'w-9' : 'w-11';
  return (
    <div className={`inline-flex ${h} shrink-0 items-center rounded-full ${shell}`}>
      <button
        type="button"
        onClick={onDecrement}
        className={`flex ${h} ${w} items-center justify-center rounded-full transition-colors ${btn}`}
        aria-label={`Remove one ${label}`}
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>
      {/* key={quantity}: har badlaav pe number halka sa "pop" karta hai */}
      <span key={quantity} className="tabular min-w-6 animate-bump text-center text-sm font-bold" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={quantity >= max}
        className={`flex ${h} ${w} items-center justify-center rounded-full transition-colors disabled:opacity-40 ${btn}`}
        aria-label={`Add one more ${label}`}
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/** Photo slot ke neeche wala ADD button. `customisable` pe chhota + (sheet khulega). */
export function AddButton({ onClick, label, customisable }: { onClick: () => void; label: string; customisable?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Add ${label}`}
      className="relative flex h-9 min-w-22 items-center justify-center rounded-full border border-line-strong bg-surface px-5 text-sm font-bold tracking-wide text-brand shadow-[0_6px_16px_-8px_rgb(43_31_20/0.45)] transition-[transform,background-color] hover:bg-brand-soft active:scale-[0.96]"
    >
      ADD
      {customisable && (
        <Plus size={12} strokeWidth={3} className="absolute right-2.5 top-1.5 text-roast-ink" aria-hidden="true" />
      )}
    </button>
  );
}

/** Cafe ke naam ke initials ("Brew Lab Cafe" → "BL") — logo ki jagah */
export function Monogram({ name, className = '' }: { name: string; className?: string }) {
  const initials =
    name
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !/^(the|cafe|café|and|&)$/i.test(w))
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || name.slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-2xl bg-roast-light font-bold tracking-tight text-brand ${className}`}
    >
      {initials}
    </span>
  );
}

interface StateScreenProps {
  icon: LucideIcon;
  tone?: 'brand' | 'danger';
  title: string;
  message?: string;
  action?: { label: string; onClick?: () => void; href?: string };
}

export function StateScreen({ icon: Icon, tone = 'brand', title, message, action }: StateScreenProps) {
  const badge = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-roast-ink';
  const btnClass =
    'mt-7 inline-flex h-12 items-center justify-center rounded-full bg-brand px-7 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.97]';
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <div className={`mb-5 flex h-16 w-16 animate-rise items-center justify-center rounded-[20px] ${badge}`}>
        <Icon size={28} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
      {message && <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-muted">{message}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className={btnClass}>
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className={btnClass}>
            {action.label}
          </button>
        ))}
    </main>
  );
}

export function PoweredBy() {
  return (
    <p className="py-10 text-center text-xs text-muted">
      Ordering powered by{' '}
      <a href="https://billraw.in" className="font-bold text-ink underline-offset-2 hover:underline">
        BillRaw
      </a>
    </p>
  );
}
