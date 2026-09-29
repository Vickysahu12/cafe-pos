'use client';

// app/order/[slug]/ProductModal.tsx
// USE CASE: Shown when a product has variants (e.g. Small/Medium/Large) or add-ons
// (e.g. Extra Cheese) — lets the customer configure it before it's added to cart.
// CONNECTED TO: lib/cart-store.ts. Opened from page.tsx's handleQuickAdd.

import { useState } from 'react';
import { X, Minus, Plus, Check, Utensils, Edit3 } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs transition-opacity sm:items-center sm:p-4">
      {/* Modal / Bottom Sheet Container */}
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[32px] bg-[#FDFCF7] shadow-2xl transition-transform sm:rounded-[32px]">
        
        {/* Mobile Drag Indicator */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-stone-300/80" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4 bg-white/60">
          <div className="flex-1">
            <h2 className="text-lg font-black text-[#134731] tracking-tight">{product.name}</h2>
            {product.description && (
              <p className="mt-1 text-xs font-medium text-gray-500 leading-relaxed line-clamp-2">
                {product.description}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-gray-500 hover:bg-stone-200 hover:text-stone-800 active:scale-95 transition-all"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Variants / Size Selection */}
          {product.variants.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-[#134731] uppercase tracking-wider">
                  Choose Portion / Size
                </span>
                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  Required
                </span>
              </div>
              <div className="space-y-2.5">
                {product.variants.map((v) => {
                  const isSelected = variant?.id === v.id;
                  return (
                    <label
                      key={v.id}
                      onClick={() => setVariant(v)}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3.5 transition-all ${
                        isSelected
                          ? 'border-[#134731] bg-emerald-50/40 shadow-xs'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all ${
                            isSelected ? 'border-[#134731] bg-[#134731] text-white' : 'border-stone-300 bg-white'
                          }`}
                        >
                          {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                        </div>
                        <span className={`text-sm font-bold ${isSelected ? 'text-[#134731]' : 'text-gray-700'}`}>
                          {v.name}
                        </span>
                      </div>
                      <span className="text-sm font-extrabold text-[#134731]">₹{v.price}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add-ons Selection */}
          {product.addons.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold text-[#134731] uppercase tracking-wider">
                  Custom Add-ons
                </span>
                <span className="text-[11px] font-semibold text-gray-400">Optional</span>
              </div>
              <div className="space-y-2.5">
                {product.addons.map((a) => {
                  const checked = selectedAddons.some((x) => x.id === a.id);
                  return (
                    <label
                      key={a.id}
                      onClick={() => toggleAddon(a)}
                      className={`flex cursor-pointer items-center justify-between rounded-2xl border px-4 py-3.5 transition-all ${
                        checked
                          ? 'border-[#134731] bg-emerald-50/40 shadow-xs'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded-lg border transition-all ${
                            checked ? 'border-[#134731] bg-[#134731] text-white' : 'border-stone-300 bg-white'
                          }`}
                        >
                          {checked && <Check size={14} strokeWidth={3} />}
                        </div>
                        <span className={`text-sm font-bold ${checked ? 'text-[#134731]' : 'text-gray-700'}`}>
                          {a.name}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-stone-600">+₹{a.price}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Kitchen Notes */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Edit3 size={14} className="text-stone-400" />
              <span className="text-xs font-extrabold text-[#134731] uppercase tracking-wider">
                Notes for the kitchen
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Make it extra spicy, serve hot..."
              rows={2}
              className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-xs font-medium text-gray-800 placeholder-stone-400 outline-none transition-all focus:border-[#134731] focus:ring-2 focus:ring-[#134731]/10 resize-none"
            />
          </div>
        </div>

        {/* Footer Controls & CTA */}
        <div className="border-t border-stone-200/80 bg-white px-6 py-4 shadow-lg">
          <div className="flex items-center gap-4">
            {/* Quantity Stepper */}
            <div className="flex items-center gap-3 rounded-full border border-stone-200 bg-stone-50/80 px-3 py-2 shadow-2xs">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#134731] shadow-2xs hover:bg-stone-100 active:scale-90 transition-all disabled:opacity-40"
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                <Minus size={14} strokeWidth={2.5} />
              </button>
              <span className="w-5 text-center text-sm font-black text-[#134731]">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#134731] shadow-2xs hover:bg-stone-100 active:scale-90 transition-all"
                aria-label="Increase quantity"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* Add Button */}
            <button
              onClick={handleAdd}
              className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[#134731] py-3.5 px-6 text-sm font-black text-white shadow-md shadow-[#134731]/20 hover:bg-[#0e3625] active:scale-[0.98] transition-all"
            >
              <span>Add to Order</span>
              <span className="text-white/40">•</span>
              <span>₹{totalPrice}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}