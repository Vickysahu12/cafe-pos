'use client';

// app/order/[slug]/ProductModal.tsx
// USE CASE: Shown when a product has variants (e.g. Small/Medium/Large) or add-ons
// (e.g. Extra Cheese) — lets the customer configure it before it's added to cart.
// CONNECTED TO: lib/cart-store.ts. Opened from page.tsx's handleQuickAdd.

import { useState } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import type { Product, ProductVariant, ProductAddon } from '@/lib/api';
import { useCartStore } from '@/lib/cart-store';

interface ProductModalProps {
  product: Product;
  onClose: () => void;
}

export function ProductModal({ product, onClose }: ProductModalProps) {
  const addItem = useCartStore((s) => s.addItem);

  const [variant, setVariant] = useState<ProductVariant | null>(product.variants[0] ?? null);
  const [selectedAddons, setSelectedAddons] = useState<ProductAddon[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const unitPrice = (variant?.price ?? product.price) + selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const totalPrice = unitPrice * quantity;

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
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">{product.name}</h2>
            {product.description && <p className="mt-1 text-xs text-muted">{product.description}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full p-1 text-muted" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        {product.variants.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-sm font-semibold text-ink">Choose size</p>
            <div className="space-y-2">
              {product.variants.map((v) => (
                <label
                  key={v.id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    variant?.id === v.id ? 'border-brand bg-brand-light' : 'border-line'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <input
                      type="radio"
                      name="variant"
                      checked={variant?.id === v.id}
                      onChange={() => setVariant(v)}
                      className="accent-brand"
                    />
                    {v.name}
                  </span>
                  <span className="font-semibold text-ink">₹{v.price}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {product.addons.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-sm font-semibold text-ink">Add-ons</p>
            <div className="space-y-2">
              {product.addons.map((a) => {
                const checked = selectedAddons.some((x) => x.id === a.id);
                return (
                  <label
                    key={a.id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                      checked ? 'border-brand bg-brand-light' : 'border-line'
                    }`}
                  >
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <input type="checkbox" checked={checked} onChange={() => toggleAddon(a)} className="accent-brand" />
                      {a.name}
                    </span>
                    <span className="font-semibold text-ink">+₹{a.price}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-5">
          <p className="mb-2 text-sm font-semibold text-ink">Notes for the kitchen (optional)</p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. less spicy, no onion"
            rows={2}
            className="w-full rounded-xl border border-line px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 rounded-full border border-line px-3 py-2">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="text-ink" aria-label="Decrease quantity">
              <Minus size={16} />
            </button>
            <span className="w-4 text-center text-sm font-semibold text-ink">{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)} className="text-ink" aria-label="Increase quantity">
              <Plus size={16} />
            </button>
          </div>

          <button
            onClick={handleAdd}
            className="flex-1 rounded-full bg-brand py-3 text-sm font-semibold text-white active:bg-brand-dark"
          >
            Add for ₹{totalPrice}
          </button>
        </div>
      </div>
    </div>
  );
}