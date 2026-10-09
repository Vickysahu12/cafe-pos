// app/(admin)/menu/[categoryId]/create-product.tsx
// USE CASE: Add a new product — name, price, veg/non-veg, tax rate, and dynamic
//           variant/addon lists (e.g. Small/Large, Extra Cheese). Matches backend's
//           nested-create support in a single request.
// CONNECTED TO: menu.api.ts (createProduct). Returns to products.tsx on success.
//
// FIX (2026-09-29): ab yahi screen EDIT bhi karti hai — `productId` param aaye
// to product load hota hai, form pre-filled, "Save Changes" + "Available" toggle
// + "Delete Product". Pehle ek baar product banne ke baad price tak nahi badal
// sakte the. (Price change backend pe PRICE_CHANGE audit log likhta hai.)

import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Alert, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, X, ChefHat, ChevronRight } from 'lucide-react-native'; // ChefHat: recipe (2026-10-09)
import { menuApi } from '../../../../features/menu/menu.api';
import { TextField } from '../../../../components/ui/TextField';
import { Button } from '../../../../components/ui/Button';
import { ErrorBanner } from '../../../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../../../lib/api-client';
import { theme } from '../../../../theme';

import { ui } from '../../../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
interface VariantRow {
  key: string;
  name: string;
  price: string;
}

export default function CreateProductScreen() {
  const router = useRouter();
  const { categoryId, productId } = useLocalSearchParams<{ categoryId: string; productId?: string }>();
  const isEdit = !!productId;

  const [loadingProduct, setLoadingProduct] = useState(isEdit);
  const [isAvailable, setIsAvailable] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Edit mode: product load karke form bharo (single-product GET endpoint nahi
  // hai, isliye category ke products mein se dhoondhte hain — list chhoti hoti hai)
  useEffect(() => {
    if (!productId) return;
    menuApi
      .getProducts({ categoryId })
      .then((list) => {
        const p = list.find((x) => x.id === productId);
        if (!p) {
          setFormError('This product no longer exists.');
          return;
        }
        setName(p.name);
        setPrice(String(p.price));
        setTaxRate(p.taxRate ? String(p.taxRate) : '');
        setIsVeg(p.isVeg);
        setIsAvailable(p.isAvailable);
        setVariants(p.variants.map((v) => ({ key: v.id, name: v.name, price: String(v.price) })));
        setAddons(p.addons.map((a) => ({ key: a.id, name: a.name, price: String(a.price) })));
      })
      .catch((err) => setFormError(getErrorMessage(err)))
      .finally(() => setLoadingProduct(false));
  }, [productId, categoryId]);

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
      if (isEdit) {
        // Edit: variants/addons HAMESHA bhejte hain (khaali array = sab hata do)
        await menuApi.updateProduct(productId!, {
          name: name.trim(),
          price: parseFloat(price),
          isVeg: isVeg as boolean,
          taxRate: taxRate ? parseFloat(taxRate) : 0,
          isAvailable,
          variants: validVariants,
          addons: validAddons,
        });
      } else {
        await menuApi.createProduct({
          name: name.trim(),
          price: parseFloat(price),
          categoryId,
          isVeg: isVeg as boolean,
          taxRate: taxRate ? parseFloat(taxRate) : 0,
          variants: validVariants.length > 0 ? validVariants : undefined,
          addons: validAddons.length > 0 ? validAddons : undefined,
        });
      }
      router.back();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      `Delete ${name || 'this product'}?`,
      'It will be removed from the menu, billing and QR ordering. Old bills will still show it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await menuApi.deleteProduct(productId!);
              router.back();
            } catch (err) {
              setFormError(getErrorMessage(err));
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loadingProduct) {
    return (
      <SafeAreaView style={[styles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View /* UI REDESIGN (2026-10-08): ALL-CAPS eyebrow badge hataya (title dobara bolta tha) */ />
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{isEdit ? 'Edit Product' : 'Add Product'}</Text>

            {formError && <ErrorBanner message={formError} />}

            {/* ADDED (2026-10-09): Stock SOP — recipe (optional): har bill pe stock apne-aap kam */}
            {isEdit && (
              <Pressable
                style={({ pressed }) => [styles.recipeRow, pressed && { opacity: 0.85 }]}
                onPress={() => router.push({ pathname: '/(admin)/menu/recipe', params: { productId: productId! } })}
                accessibilityRole="button"
              >
                <View style={styles.recipeIcon}>
                  <ChefHat size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Recipe</Text>
                  <Text style={styles.sectionHint}>Ingredients per serving. Stock goes down with every bill.</Text>
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </Pressable>
            )}

            {isEdit && (
              <View style={styles.availableRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>Available</Text>
                  <Text style={styles.sectionHint}>Turn off when out of stock — hides it from billing and QR menu</Text>
                </View>
                <Switch value={isAvailable} onValueChange={setIsAvailable} trackColor={{ true: theme.colors.primary }} />
              </View>
            )}

            <TextField label="Item name" placeholder="e.g. Cold Coffee" value={name} onChangeText={(v) => { setName(v); if (errors.name) setErrors((e) => ({ ...e, name: '' })); }} error={errors.name} returnKeyType="next" />
            <TextField label="Price (₹)" placeholder="e.g. 120" keyboardType="decimal-pad" value={price} onChangeText={(v) => { setPrice(v); if (errors.price) setErrors((e) => ({ ...e, price: '' })); }} error={errors.price} returnKeyType="next" />
            <TextField label="GST % (optional)" placeholder="e.g. 5" keyboardType="decimal-pad" value={taxRate} onChangeText={setTaxRate} returnKeyType="next" />

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

            <Button title={isEdit ? 'Save Changes' : 'Add Product'} onPress={handleSubmit} loading={saving} style={{ marginTop: theme.spacing.lg }} />
            {isEdit && (
              <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={deleting}>
                <Text style={styles.deleteButtonText}>{deleting ? 'Deleting…' : 'Delete Product'}</Text>
              </Pressable>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
  backButton: { ...ui.iconButton },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontFamily: theme.typography.font.bold, color: theme.colors.white, letterSpacing: 0.6 },
  content: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  fieldLabel: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  vegRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  vegChip: { flex: 1, height: 44, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  vegChipActiveGreen: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  vegChipActiveRed: { backgroundColor: theme.colors.danger, borderColor: theme.colors.danger },
  vegChipText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  vegChipTextActive: { color: theme.colors.white },
  errorText: { fontSize: theme.typography.size.xs, fontFamily: theme.typography.font.regular, color: theme.colors.danger, marginBottom: theme.spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: theme.spacing.lg, marginBottom: 2 },
  sectionTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  sectionHint: { fontSize: theme.typography.size.xs, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginBottom: theme.spacing.sm },
  addRowButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addRowText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.primary },
  dynamicRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' },
  removeRowButton: { width: 44, height: 52, justifyContent: 'center', alignItems: 'center' },
  // ADDED (2026-10-09): recipe entry row
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  recipeIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  availableRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
    padding: theme.spacing.md, marginBottom: theme.spacing.lg,
  },
  deleteButton: { alignItems: 'center', paddingVertical: theme.spacing.lg, marginTop: theme.spacing.sm },
  deleteButtonText: { color: theme.colors.danger, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});