'use client';

// app/order/[slug]/ProductModal.tsx
// USE CASE: Shown when a product has variants (e.g. Small/Medium/Large) or add-ons
// (e.g. Extra Cheese) — lets the customer configure it before it's added to cart.
// CONNECTED TO: lib/cart-store.ts. Opened from page.tsx's handleAdd.
//
// UI/UX PASS (2026-09-30):
//  - Proper dialog: role="dialog", Escape se band, backdrop tap se band, peeche ka page scroll nahi hota
//  - Real radio/checkbox inputs (keyboard + screen reader friendly) — pehle <label onClick> tha
//  - Sabse sasta size default selected (menu pe "from ₹X" se match)
//  - Note max 200 chars (backend limit — pehle lamba note order fail karta tha)
//  - 40px+ tap targets, design tokens, VegMark

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Product, ProductVariant, ProductAddon } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { formatINR, round2 } from '@/lib/money';
import { QtyStepper, VegMark } from '@/components/ui';

interface ProductModalProps {
  product: Product;
  onClose: () => void;
}

const NOTE_LIMIT = 200;

export function ProductModal({ product, onClose }: ProductModalProps) {
  const addItem = useCartStore((s) => s.addItem);

  // Backend variants price ke hisaab se sorted bhejta hai — pehla = sabse sasta
  const [variant, setVariant] = useState<ProductVariant | null>(product.variants[0] ?? null);
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const unitPrice = round2((variant?.price ?? product.price) + selectedAddons.reduce((sum, a) => sum + a.price, 0));
  const totalPrice = round2(unitPrice * quantity);

  // Escape se band + peeche ka page scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggleAddon = (addon: ProductAddon) => {
    setSelectedAddons((prev) =>
      prev.some((a) => a.id === addon.id) ? prev.filter((a) => a.id !== addon.id) : [...prev, addon]
    );
  };

  const handleAdd = () => {
    addItem(product, variant, selectedAddons, quantity, notes.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/50" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-paper shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-start gap-2">
              <VegMark isVeg={product.isVeg} className="mt-1.25" />
              <h2 id="product-modal-title" className="text-lg font-extrabold leading-snug text-ink">
                {product.name}
              </h2>
            </div>
            {product.description && <p className="mt-1 text-sm leading-relaxed text-muted">{product.description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-muted transition-colors hover:text-ink"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Options */}
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {product.variants.length > 0 && (
            <fieldset>
              <legend className="mb-3 flex w-full items-center justify-between">
                <span className="text-sm font-extrabold text-ink">Choose a size</span>
                <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand">Required</span>
              </legend>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {product.variants.map((v, i) => {
                  const selected = variant?.id === v.id;
                  return (
                    <label
                      key={v.id}
                      className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''} ${selected ? 'bg-brand-soft/60' : ''}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="variant"
                          checked={selected}
                          onChange={() => setVariant(v)}
                          className="h-5 w-5 accent-brand"
                        />
                        <span className="text-[15px] font-semibold text-ink">{v.name}</span>
                      </span>
                      <span className="text-[15px] font-bold text-ink">{formatINR(v.price)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {product.addons.length > 0 && (
            <fieldset>
              <legend className="mb-3 flex w-full items-center justify-between">
                <span className="text-sm font-extrabold text-ink">Add-ons</span>
                <span className="text-xs font-semibold text-muted">Optional</span>
              </legend>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface">
                {product.addons.map((a, i) => {
                  const checked = selectedAddons.some((x) => x.id === a.id);
                  return (
                    <label
                      key={a.id}
                      className={`flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 ${i > 0 ? 'border-t border-line' : ''} ${checked ? 'bg-brand-soft/60' : ''}`}
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAddon(a)}
                          className="h-5 w-5 rounded accent-brand"
                        />
                        <span className="text-[15px] font-semibold text-ink">{a.name}</span>
                      </span>
                      <span className="text-[15px] font-semibold text-muted">+{formatINR(a.price)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div>
            <label htmlFor="item-note" className="mb-2 flex items-center justify-between">
              <span className="text-sm font-extrabold text-ink">Note for the kitchen</span>
              <span className="text-xs text-muted">
                {notes.length}/{NOTE_LIMIT}
              </span>
            </label>
            <textarea
              id="item-note"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, NOTE_LIMIT))}
              placeholder="e.g. Less sugar, no onion"
              rows={2}
              className="w-full resize-none rounded-2xl border border-line bg-surface px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
          <QtyStepper
            quantity={quantity}
            label={product.name}
            variant="soft"
            onDecrement={() => setQuantity((q) => Math.max(1, q - 1))}
            onIncrement={() => setQuantity((q) => Math.min(100, q + 1))}
          />
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-colors hover:bg-brand-hover"
          >
            Add to order · {formatINR(totalPrice)}
          </button>
        </div>
      </div>
    </div>
  );
}
