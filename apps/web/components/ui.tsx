// components/ui.tsx
// USE CASE (2026-09-30): Customer site ke chhote shared UI pieces — har page pe ek jaisa
// dikhe aur behave kare (pehle har page ne apna stepper/veg-mark/error-screen banaya tha).
//   - VegMark: India ka FSSAI symbol (green dot / brown triangle)
//   - QtyStepper: +/- with 40px+ tap targets (pehle 13px icons the — phone pe miss hote)
//   - StateScreen: full-page empty/error state with one clear action
//   - PoweredBy: subtle footer brand mark

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
}

export function QtyStepper({ quantity, onDecrement, onIncrement, label, max = 100, variant = 'solid' }: QtyStepperProps) {
  const solid = variant === 'solid';
  const shell = solid ? 'bg-brand text-white' : 'bg-surface text-brand border border-line';
  const btn = solid ? 'hover:bg-white/10' : 'hover:bg-brand-soft';
  return (
    <div className={`inline-flex h-10 shrink-0 items-center rounded-full ${shell}`}>
      <button
        type="button"
        onClick={onDecrement}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${btn}`}
        aria-label={`Remove one ${label}`}
      >
        <Minus size={16} strokeWidth={2.5} />
      </button>
      <span className="min-w-[1.5rem] text-center text-sm font-bold tabular-nums" aria-live="polite">
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={quantity >= max}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${btn}`}
        aria-label={`Add one more ${label}`}
      >
        <Plus size={16} strokeWidth={2.5} />
      </button>
    </div>
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
  const badge = tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand';
  const btnClass =
    'mt-6 inline-flex h-12 items-center justify-center rounded-full bg-brand px-7 text-sm font-bold text-white transition-colors hover:bg-brand-hover';
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${badge}`}>
        <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <h1 className="text-lg font-extrabold text-ink">{title}</h1>
      {message && <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">{message}</p>}
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
    <p className="py-8 text-center text-xs text-muted">
      Ordering powered by{' '}
      <a href="https://billraw.in" className="font-bold text-brand underline-offset-2 hover:underline">
        BillRaw
      </a>
    </p>
  );
}
