// app/(admin)/inventory/create.tsx
// USE CASE: Add a new inventory item — name, starting quantity, unit, low-stock threshold.
// CONNECTED TO: inventory.api.ts (createItem). Returns to index.tsx on success.

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
import { theme } from '../../../theme';

const UNIT_OPTIONS = ['kg', 'g', 'litres', 'ml', 'packets', 'pieces'];

export default function CreateInventoryItemScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [threshold, setThreshold] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setFormError(null);
    const newErrors: Record<string, string> = {};
    if (name.trim().length < 2) newErrors.name = 'Name is too short';
    if (!quantity || parseFloat(quantity) < 0) newErrors.quantity = 'Enter a valid quantity';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      await inventoryApi.createItem({
        name: name.trim(),
        quantity: parseFloat(quantity),
        unit,
        lowStockAlertAt: threshold ? parseFloat(threshold) : 0,
      });
      router.back();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Item</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>New Inventory Item</Text>

            {formError && <ErrorBanner message={formError} />}

            <TextField
              label="Item Name"
              placeholder="e.g. Milk, Coffee Beans"
              value={name}
              onChangeText={(v) => { setName(v); if (errors.name) setErrors((e) => ({ ...e, name: '' })); }}
              error={errors.name}
              returnKeyType="next"
            />
            <TextField
              label="Starting Quantity"
              placeholder="e.g. 20"
              keyboardType="decimal-pad"
              value={quantity}
              onChangeText={(v) => { setQuantity(v); if (errors.quantity) setErrors((e) => ({ ...e, quantity: '' })); }}
              error={errors.quantity}
              returnKeyType="next"
            />

            <Text style={styles.fieldLabel}>Unit</Text>
            <View style={styles.unitRow}>
              {UNIT_OPTIONS.map((u) => (
                <Pressable key={u} style={[styles.unitChip, unit === u && styles.unitChipActive]} onPress={() => setUnit(u)}>
                  <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
                </Pressable>
              ))}
            </View>

            <TextField
              label="Low Stock Alert At (optional)"
              placeholder="e.g. 5 — alert when quantity drops to this"
              keyboardType="decimal-pad"
              value={threshold}
              onChangeText={setThreshold}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />

            <Button title="Add Item" onPress={handleSubmit} loading={saving} style={{ marginTop: theme.spacing.sm }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  headerTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  content: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  fieldLabel: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  unitChip: { paddingHorizontal: theme.spacing.md, height: 36, borderRadius: theme.radius.full, borderWidth: 1.5, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  unitChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  unitChipText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary },
  unitChipTextActive: { color: theme.colors.white },
});