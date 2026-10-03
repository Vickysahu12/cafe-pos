'use client';

// app/order/[slug]/ProductModal.tsx
// USE CASE: Item ki detail sheet — size (variants), add-ons, kitchen note, quantity.
// CONNECTED TO: lib/cart-store.ts. Menu page pe item/photo tap ya customisable ADD se khulta hai.
//
// UI/UX PASS (2026-09-30):
//  - Proper dialog: role="dialog", Escape se band, backdrop tap se band, peeche ka page scroll nahi hota
//  - Real radio/checkbox inputs (keyboard + screen reader friendly)
//  - Sabse sasta size default selected (menu pe "from ₹X" se match)
//  - Note max 200 chars (backend limit — pehle lamba note order fail karta tha)
//
// REDESIGN (2026-10-02):
//  - Upar bada PHOTO SLOT (V2 mein asli photo yahin) + floating close button
//  - Neeche se slide-up (drawer curve, native app jaisa), backdrop fade
//  - Ab simple items (bina size/add-on) ke liye bhi khulta hai — description padho,
//    "less spicy" jaisa note likho
//  - Size/add-on rows: selected pe roast ring, 56px tap height

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Product, ProductVariant, ProductAddon } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';
import { formatINR, round2 } from '@/lib/money';
import { ProductArt } from '@/lib/product-visual';
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

  const optionRow = (selected: boolean, first: boolean) =>
    `flex min-h-14 cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors ${first ? '' : 'border-t border-line'} ${
      selected ? 'bg-brand-soft' : 'hover:bg-paper'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 animate-fade-in bg-ink/55" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-modal-title"
        className="relative flex max-h-[92dvh] w-full max-w-lg animate-sheet-up flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:animate-rise sm:rounded-[28px]"
      >
        <div className="flex-1 overflow-y-auto">
          {/* Photo slot */}
          <div className="relative">
            <ProductArt name={product.name} iconSize={64} className="h-52 w-full" />
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-md transition-transform active:scale-95"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-5 pb-6 pt-5">
            <VegMark isVeg={product.isVeg} />
            <h2 id="product-modal-title" className="mt-2 text-xl font-bold leading-snug tracking-tight text-ink">
              {product.name}
            </h2>
            <p className="tabular mt-1 text-base font-semibold text-ink">
              {product.variants.length > 1 && <span className="mr-1 text-sm font-normal text-muted">from</span>}
              {formatINR(product.variants[0]?.price ?? product.price)}
            </p>
            {product.description && <p className="mt-3 text-[15px] leading-relaxed text-muted">{product.description}</p>}

            <div className="mt-6 space-y-6">
              {product.variants.length > 0 && (
                <fieldset>
                  <legend className="mb-3 flex w-full items-center justify-between">
                    <span className="text-[15px] font-bold text-ink">Choose a size</span>
                    <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-bold text-warn-ink">Required</span>
                  </legend>
                  <div className="overflow-hidden rounded-2xl border border-line">
                    {product.variants.map((v, i) => {
                      const selected = variant?.id === v.id;
                      return (
                        <label key={v.id} className={optionRow(selected, i === 0)}>
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
                          <span className="tabular text-[15px] font-semibold text-ink">{formatINR(v.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {product.addons.length > 0 && (
                <fieldset>
                  <legend className="mb-3 flex w-full items-center justify-between">
                    <span className="text-[15px] font-bold text-ink">Add-ons</span>
                    <span className="text-xs font-semibold text-muted">Optional</span>
                  </legend>
                  <div className="overflow-hidden rounded-2xl border border-line">
                    {product.addons.map((a, i) => {
                      const checked = selectedAddons.some((x) => x.id === a.id);
                      return (
                        <label key={a.id} className={optionRow(checked, i === 0)}>
                          <span className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAddon(a)}
                              className="h-5 w-5 rounded accent-brand"
                            />
                            <span className="text-[15px] font-semibold text-ink">{a.name}</span>
                          </span>
                          <span className="tabular text-[15px] font-medium text-muted">+{formatINR(a.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              <div>
                <label htmlFor="item-note" className="mb-2 flex items-center justify-between">
                  <span className="text-[15px] font-bold text-ink">Note for the kitchen</span>
                  <span className="tabular text-xs text-muted">
                    {notes.length}/{NOTE_LIMIT}
                  </span>
                </label>
                <textarea
                  id="item-note"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value.slice(0, NOTE_LIMIT))}
                  placeholder="e.g. Less sugar, no onion"
                  rows={2}
                  className="w-full resize-none rounded-2xl border border-line bg-paper px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:border-roast focus:bg-surface focus:outline-none"
                />
              </div>
            </div>
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
            className="flex h-12 flex-1 items-center justify-between gap-2 rounded-full bg-brand px-5 text-[15px] font-bold text-white transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.98]"
          >
            <span>Add to order</span>
            <span className="tabular">{formatINR(totalPrice)}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
