// app/(admin)/menu/[categoryId]/create-product.tsx
// USE CASE: Add a new product — name, price, veg/non-veg, tax rate, and dynamic
//           variant/addon lists (e.g. Small/Large, Extra Cheese). Matches backend's
//           nested-create support in a single request.
// CONNECTED TO: menu.api.ts (createProduct). Returns to products.tsx on success.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, X } from 'lucide-react-native';
import { menuApi } from '../../../../features/menu/menu.api';
import { TextField } from '../../../../components/ui/TextField';
import { Button } from '../../../../components/ui/Button';
import { ErrorBanner } from '../../../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../../../lib/api-client';
import { theme } from '../../../../theme';

interface VariantRow {
  key: string;
  name: string;
  price: string;
}

export default function CreateProductScreen() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();

  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [isVeg, setIsVeg] = useState<boolean | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [addons, setAddons] = useState<VariantRow[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const addVariant = () => setVariants((v) => [...v, { key: Date.now().toString(), name: '', price: '' }]);
  const addAddon = () => setAddons((a) => [...a, { key: Date.now().toString(), name: '', price: '' }]);
  const removeVariant = (key: string) => setVariants((v) => v.filter((r) => r.key !== key));
  const removeAddon = (key: string) => setAddons((a) => a.filter((r) => r.key !== key));

  const handleSubmit = async () => {
    setFormError(null);
    const newErrors: Record<string, string> = {};
    if (name.trim().length < 2) newErrors.name = 'Name is too short';
    if (!price || parseFloat(price) <= 0) newErrors.price = 'Enter a valid price';
    if (isVeg === null) newErrors.isVeg = 'Select Veg or Non-Veg';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Skip any variant/addon rows left blank — don't force the user to fill or delete them
    const validVariants = variants.filter((v) => v.name.trim() && v.price).map((v) => ({ name: v.name.trim(), price: parseFloat(v.price) }));
    const validAddons = addons.filter((a) => a.name.trim() && a.price).map((a) => ({ name: a.name.trim(), price: parseFloat(a.price) }));

    Keyboard.dismiss();
    setSaving(true);
    try {
      await menuApi.createProduct({
        name: name.trim(),
        price: parseFloat(price),
        categoryId,
        isVeg: isVeg as boolean,
        taxRate: taxRate ? parseFloat(taxRate) : 0,
        variants: validVariants.length > 0 ? validVariants : undefined,
        addons: validAddons.length > 0 ? validAddons : undefined,
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
        <View style={styles.badge}>
          <Text style={styles.badgeText}>NEW ITEM</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Add Product</Text>

            {formError && <ErrorBanner message={formError} />}

            <TextField label="Product Name" placeholder="e.g. Cold Coffee" value={name} onChangeText={(v) => { setName(v); if (errors.name) setErrors((e) => ({ ...e, name: '' })); }} error={errors.name} returnKeyType="next" />
            <TextField label="Base Price (₹)" placeholder="e.g. 120" keyboardType="decimal-pad" value={price} onChangeText={(v) => { setPrice(v); if (errors.price) setErrors((e) => ({ ...e, price: '' })); }} error={errors.price} returnKeyType="next" />
            <TextField label="Tax Rate % (optional)" placeholder="e.g. 5" keyboardType="decimal-pad" value={taxRate} onChangeText={setTaxRate} returnKeyType="next" />

            <Text style={styles.fieldLabel}>Type</Text>
            <View style={styles.vegRow}>
              <Pressable style={[styles.vegChip, isVeg === true && styles.vegChipActiveGreen]} onPress={() => { setIsVeg(true); if (errors.isVeg) setErrors((e) => ({ ...e, isVeg: '' })); }}>
                <Text style={[styles.vegChipText, isVeg === true && styles.vegChipTextActive]}>Veg</Text>
              </Pressable>
              <Pressable style={[styles.vegChip, isVeg === false && styles.vegChipActiveRed]} onPress={() => { setIsVeg(false); if (errors.isVeg) setErrors((e) => ({ ...e, isVeg: '' })); }}>
                <Text style={[styles.vegChipText, isVeg === false && styles.vegChipTextActive]}>Non-Veg</Text>
              </Pressable>
            </View>
            {!!errors.isVeg && <Text style={styles.errorText}>{errors.isVeg}</Text>}

            {/* Variants */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Variants (optional)</Text>
              <Pressable onPress={addVariant} style={styles.addRowButton}>
                <Plus size={14} color={theme.colors.primary} />
                <Text style={styles.addRowText}>Add</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>e.g. Small, Medium, Large — each with its own price</Text>
            {variants.map((row) => (
              <View key={row.key} style={styles.dynamicRow}>
                <View style={{ flex: 1.4 }}>
                  <TextField label="" placeholder="Name" value={row.name} onChangeText={(v) => setVariants((rows) => rows.map((r) => (r.key === row.key ? { ...r, name: v } : r)))} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="" placeholder="₹ Price" keyboardType="decimal-pad" value={row.price} onChangeText={(v) => setVariants((rows) => rows.map((r) => (r.key === row.key ? { ...r, price: v } : r)))} />
                </View>
                <Pressable onPress={() => removeVariant(row.key)} style={styles.removeRowButton}>
                  <X size={16} color={theme.colors.danger} />
                </Pressable>
              </View>
            ))}

            {/* Addons */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Addons (optional)</Text>
              <Pressable onPress={addAddon} style={styles.addRowButton}>
                <Plus size={14} color={theme.colors.primary} />
                <Text style={styles.addRowText}>Add</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>e.g. Extra Cheese, Extra Shot — added on top of base price</Text>
            {addons.map((row) => (
              <View key={row.key} style={styles.dynamicRow}>
                <View style={{ flex: 1.4 }}>
                  <TextField label="" placeholder="Name" value={row.name} onChangeText={(v) => setAddons((rows) => rows.map((r) => (r.key === row.key ? { ...r, name: v } : r)))} />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="" placeholder="₹ Price" keyboardType="decimal-pad" value={row.price} onChangeText={(v) => setAddons((rows) => rows.map((r) => (r.key === row.key ? { ...r, price: v } : r)))} />
                </View>
                <Pressable onPress={() => removeAddon(row.key)} style={styles.removeRowButton}>
                  <X size={16} color={theme.colors.danger} />
                </Pressable>
              </View>
            ))}

            <Button title="Add Product" onPress={handleSubmit} loading={saving} style={{ marginTop: theme.spacing.lg }} />
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
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.white, letterSpacing: 0.6 },
  content: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  fieldLabel: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  vegRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  vegChip: { flex: 1, height: 44, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  vegChipActiveGreen: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  vegChipActiveRed: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  vegChipText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },
  vegChipTextActive: { color: theme.colors.white },
  errorText: { fontSize: theme.typography.size.xs, color: theme.colors.danger, marginBottom: theme.spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.lg, marginBottom: 2 },
  sectionTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  sectionHint: { fontSize: theme.typography.size.xs, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  addRowButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addRowText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.primary },
  dynamicRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  removeRowButton: { width: 44, height: 52, justifyContent: 'center', alignItems: 'center' },
});