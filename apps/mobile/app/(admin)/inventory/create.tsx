// app/(admin)/inventory/create.tsx
// USE CASE: Add a new inventory item — name, starting quantity, unit, low-stock threshold.
// CONNECTED TO: inventory.api.ts (createItem). Returns to index.tsx on success.
//
// UPDATED (2026-10-09) — STOCK SOP:
//  - Unit sirf kg / g / L / ml / pcs (recipe "150 ml" ↔ stock "L" auto convert hota hai).
//    "litres/packets" free text hataya — alag-alag spelling se conversion toot-ta.
//  - Unit pehle chunte hain (baaki fields ke label usi unit mein: "Starting stock (L)").
//  - Cost per unit (₹, optional) → recipe cost, profit, wastage aur count variance ₹ mein.
//  - Unit baad mein badal nahi sakte (history + recipes usi mein) — screen pe saaf likha.
//  - Input sirf number (paste kiya kachra saaf), 3 decimal tak. Server bhi validate karta hai.
//  - Duplicate naam pe server ka saaf message ("Milk is already in your stock list").

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { inventoryApi } from '../../../features/inventory/inventory.api';
import { TextField } from '../../../components/ui/TextField';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../../lib/api-client';
import { haptics } from '../../../lib/haptics';
import { STOCK_UNITS, StockUnit, cleanQtyInput, parseQty } from '../../../lib/units';
import { theme } from '../../../theme';

import { ui } from '../../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button

const UNIT_EXAMPLE: Record<StockUnit, string> = {
  kg: 'e.g. Coffee beans, sugar, flour',
  g: 'e.g. Saffron, spices',
  L: 'e.g. Milk, cream, syrup',
  ml: 'e.g. Vanilla essence',
  pcs: 'e.g. Cups, lids, buns, eggs',
};

export default function CreateInventoryItemScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<StockUnit>('kg');
  const [quantity, setQuantity] = useState('');
  const [threshold, setThreshold] = useState('');
  const [cost, setCost] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearError = (key: string) => setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));

  const handleSubmit = async () => {
    if (saving) return;
    setFormError(null);
    const qty = parseQty(quantity);
    const alertAt = threshold.trim() ? parseQty(threshold) : 0;
    const costPerUnit = cost.trim() ? parseQty(cost) : 0;
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Name is too short';
    else if (name.trim().length > 60) next.name = 'Name is too long';
    if (qty === null || qty < 0) next.quantity = 'Enter how much you have now (0 is fine)';
    if (alertAt === null || alertAt < 0) next.threshold = 'Enter a valid number';
    if (costPerUnit === null || costPerUnit < 0) next.cost = 'Enter a valid cost';
    if (Object.values(next).some(Boolean)) {
      setErrors(next);
      haptics.error();
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      await inventoryApi.createItem({
        name: name.trim(),
        quantity: qty!,
        unit,
        lowStockAlertAt: alertAt ?? 0,
        costPerUnit: costPerUnit ?? 0,
      });
      haptics.success();
      router.back();
    } catch (err) {
      haptics.error();
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Add item</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>New stock item</Text>

            {formError && <ErrorBanner message={formError} />}

            <TextField
              label="Item name"
              placeholder={UNIT_EXAMPLE[unit]}
              value={name}
              onChangeText={(v) => { setName(v); clearError('name'); }}
              error={errors.name}
              maxLength={60}
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>Measured in</Text>
            <View style={styles.unitRow} accessibilityRole="radiogroup">
              {STOCK_UNITS.map((u) => {
                const active = unit === u.unit;
                return (
                  <Pressable
                    key={u.unit}
                    style={[styles.unitChip, active && styles.unitChipActive]}
                    onPress={() => { haptics.tap(); setUnit(u.unit); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={u.hint}
                  >
                    <Text style={[styles.unitChipText, active && styles.unitChipTextActive]}>{u.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.unitHint}>
              {STOCK_UNITS.find((u) => u.unit === unit)?.hint}. Recipes can use {unit === 'L' || unit === 'ml' ? 'ml or L' : unit === 'kg' || unit === 'g' ? 'g or kg' : 'pieces'}. The unit can't be changed later.
            </Text>

            <TextField
              label={`Stock you have now (${unit})`}
              placeholder="e.g. 20"
              keyboardType="decimal-pad"
              value={quantity}
              onChangeText={(v) => { setQuantity(cleanQtyInput(v)); clearError('quantity'); }}
              error={errors.quantity}
              returnKeyType="next"
            />
            <TextField
              label={`Cost per ${unit} (₹, optional)`}
              placeholder={unit === 'pcs' ? 'e.g. 3' : unit === 'L' ? 'e.g. 60' : 'e.g. 800'}
              keyboardType="decimal-pad"
              value={cost}
              onChangeText={(v) => { setCost(cleanQtyInput(v, 2)); clearError('cost'); }}
              error={errors.cost}
              returnKeyType="next"
            />
            <TextField
              label={`Alert me below (${unit}, optional)`}
              placeholder="e.g. 5"
              keyboardType="decimal-pad"
              value={threshold}
              onChangeText={(v) => { setThreshold(cleanQtyInput(v)); clearError('threshold'); }}
              error={errors.threshold}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
            <Text style={styles.unitHint}>Cost lets BillRaw show your profit per item and what waste costs you.</Text>

            <Button title="Add item" onPress={handleSubmit} loading={saving} style={{ marginTop: theme.spacing.md }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { ...ui.headerBar },
  backButton: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },
  content: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  fieldLabel: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  unitChip: { minWidth: 56, paddingHorizontal: theme.spacing.md, height: 40, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center' },
  unitChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  unitChipText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  unitChipTextActive: { color: theme.colors.white },
  unitHint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginBottom: theme.spacing.lg, lineHeight: 17 },
});
