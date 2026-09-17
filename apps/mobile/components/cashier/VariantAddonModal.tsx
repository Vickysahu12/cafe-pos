// components/cashier/VariantAddonModal.tsx
// USE CASE: Quick-select modal shown when a Cashier taps a product that has variants
//           (Small/Large) and/or addons (Extra Cheese). Computes the live running price
//           as selections change, so the Cashier sees the exact total before confirming —
//           this display price is purely informational; the backend independently
//           recalculates the real charge from the DB when the order is actually created.
// CONNECTED TO: (cashier)/billing.tsx. Uses Product/ProductVariant/ProductAddon types
//               from menu.api.ts.

import { useState, useMemo } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { X, Minus, Plus, Check } from 'lucide-react-native';
import { Product, ProductVariant, ProductAddon } from '../../features/menu/menu.api';
import { theme } from '../../theme';

interface VariantAddonModalProps {
  product: Product;
  onClose: () => void;
  onConfirm: (variant: ProductVariant | null, addons: ProductAddon[], quantity: number, notes?: string) => void;
}

export function VariantAddonModal({ product, onClose, onConfirm }: VariantAddonModalProps) {
  // Default to the first variant if the product has any — a variant product almost
  // always needs one selected, so pre-picking the first avoids an extra required tap
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(product.variants[0] ?? null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  const selectedAddons = useMemo(
    () => product.addons.filter((a) => selectedAddonIds.has(a.id)),
    [product.addons, selectedAddonIds]
  );

  const unitPrice = (selectedVariant?.price ?? product.price) + selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const totalPrice = unitPrice * quantity;

  const toggleAddon = (addonId: string) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) next.delete(addonId);
      else next.add(addonId);
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(selectedVariant, selectedAddons, quantity, notes.trim() || undefined);
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.basePrice}>Base ₹{product.price}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <X size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* Variants — single select, radio-style */}
            {product.variants.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Choose Size</Text>
                {product.variants.map((v) => {
                  const active = selectedVariant?.id === v.id;
                  return (
                    <Pressable key={v.id} style={[styles.optionRow, active && styles.optionRowActive]} onPress={() => setSelectedVariant(v)}>
                      <View style={[styles.radio, active && styles.radioActive]}>{active && <View style={styles.radioDot} />}</View>
                      <Text style={styles.optionLabel}>{v.name}</Text>
                      <Text style={styles.optionPrice}>₹{v.price}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Addons — multi select, checkbox-style */}
            {product.addons.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Add Extras</Text>
                {product.addons.map((a) => {
                  const active = selectedAddonIds.has(a.id);
                  return (
                    <Pressable key={a.id} style={[styles.optionRow, active && styles.optionRowActive]} onPress={() => toggleAddon(a.id)}>
                      <View style={[styles.checkbox, active && styles.checkboxActive]}>
                        {active && <Check size={12} color={theme.colors.white} strokeWidth={3} />}
                      </View>
                      <Text style={styles.optionLabel}>{a.name}</Text>
                      <Text style={styles.optionPrice}>+₹{a.price}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Notes */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notes (optional)</Text>
              <TextInput
                style={styles.notesInput}
                placeholder="e.g. Less sugar, extra hot"
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
              />
            </View>
          </ScrollView>

          {/* Quantity stepper + Confirm */}
          <View style={styles.footer}>
            <View style={styles.quantityStepper}>
              <Pressable
                style={styles.stepperButton}
                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
              >
                <Minus size={16} color={quantity <= 1 ? theme.colors.textMuted : theme.colors.textPrimary} />
              </Pressable>
              <Text style={styles.quantityText}>{quantity}</Text>
              <Pressable style={styles.stepperButton} onPress={() => setQuantity((q) => q + 1)}>
                <Plus size={16} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <Pressable style={styles.confirmButton} onPress={handleConfirm}>
              <Text style={styles.confirmButtonText}>Add to Cart · ₹{totalPrice}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.5)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0, maxHeight: '85%' },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg + 8,
    borderTopRightRadius: theme.radius.lg + 8,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  handle: { width: 40, height: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: theme.spacing.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: theme.spacing.md },
  productName: { fontSize: theme.typography.size.xl, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary },
  basePrice: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted, marginTop: 2 },
  closeButton: { width: 32, height: 32, borderRadius: theme.radius.full, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },

  scrollArea: { maxHeight: 340 },
  section: { marginBottom: theme.spacing.lg },
  sectionTitle: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  optionRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  radio: { width: 20, height: 20, borderRadius: theme.radius.full, borderWidth: 2, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  radioActive: { borderColor: theme.colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  checkboxActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
  optionLabel: { flex: 1, fontSize: theme.typography.size.base, color: theme.colors.textPrimary, fontWeight: theme.typography.weight.medium },
  optionPrice: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },

  notesInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: theme.typography.size.base,
    color: theme.colors.textPrimary,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  footer: { flexDirection: 'row', gap: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
  quantityStepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.sm },
  stepperButton: { width: 32, height: 44, justifyContent: 'center', alignItems: 'center' },
  quantityText: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, minWidth: 20, textAlign: 'center' },
  confirmButton: { flex: 1, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  confirmButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});