// app/(admin)/menu/recipe.tsx
// ADDED (2026-10-09) — STOCK SOP: RECIPE EDITOR. "Ek Latte mein 200 ml doodh, 18 g coffee, 1 cup."
// Save ke baad har bill pe yeh ingredients stock se apne-aap kat-te hain (backend stock.service.ts).
//  - Sizes: "All sizes" (default) + har size (Regular/Large). Size ki apni recipe nahi → default lagti
//    hai. "Use a different recipe for Large" = default copy karke badlo.
//  - Har line: ingredient, quantity, unit (sirf compatible: doodh L mein → ml ya L), line ka cost
//  - Live cost card: cost, price, margin, food cost % (cafes 25–35% target rakhte hain)
//  - Bina save kiye back → "Discard changes?" (back button + Android back)
//  - Server bhi sab check karta hai (unit, size naam, doosre cafe ka item) — galat recipe kabhi save nahi
// CONNECTED TO: inventory.api.ts (getRecipe / saveRecipe / getItems), lib/units.ts,
// menu/[categoryId]/products.tsx (chip), menu/[categoryId]/create-product.tsx, inventory/[id].tsx (Used in)

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { ArrowLeft, Plus, X, Search, Package, Info } from 'lucide-react-native';
import { inventoryApi, InventoryItem, Recipe } from '../../../features/inventory/inventory.api';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { getErrorMessage } from '../../../lib/api-client';
import { haptics } from '../../../lib/haptics';
import { formatINR } from '../../../lib/format';
import { compatibleUnits, convertQty, recipeDefaultUnit, parseQty, cleanQtyInput, formatQty, formatNumber } from '../../../lib/units';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/StateViews';
import { theme } from '../../../theme';
import { ui } from '../../../theme/ui';

const NUM = { fontVariant: ['tabular-nums' as const] };

type Draft = { key: string; variantName: string | null; inventoryItemId: string; qty: string; unit: string };
let keySeq = 0;
const newKey = () => `l${++keySeq}`;

function toDraft(recipe: Recipe): Draft[] {
  return recipe.lines.map((l) => ({
    key: newKey(),
    variantName: l.variantName,
    inventoryItemId: l.inventoryItemId,
    qty: formatNumber(l.quantity).replace(/,/g, ''),
    unit: l.unit,
  }));
}

/** Draft ko compare karne layak string (dirty check) */
function signature(lines: Draft[]): string {
  return lines
    .map((l) => `${l.variantName ?? ''}|${l.inventoryItemId}|${parseQty(l.qty) ?? 'x'}|${l.unit}`)
    .sort()
    .join(';');
}

function foodCostColor(pct: number) {
  if (pct <= 35) return theme.colors.success;
  if (pct <= 45) return theme.colors.warning;
  return theme.colors.danger;
}

export default function RecipeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { productId } = useLocalSearchParams<{ productId: string }>();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [stock, setStock] = useState<InventoryItem[]>([]);
  const [lines, setLines] = useState<Draft[]>([]);
  const [saved, setSaved] = useState('');
  const [size, setSize] = useState<string | null>(null); // null = All sizes
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);
  // Menu se size hata/rename hua → uski purani recipe lines kisi size se match nahi karti. Unhe draft
  // se nikaal ke saaf batate hain (warna save pe server "not a size" bolta).
  const [orphanSizes, setOrphanSizes] = useState<string[]>([]);

  const loadedOnce = useRef(false);
  const { loading, error, retry } = useScreenLoad(async () => {
    // Edit ke beech focus pe dobara load NAHI (draft mit jaata) — sirf stock list fresh karo
    if (loadedOnce.current) {
      setStock(await inventoryApi.getItems());
      return;
    }
    const [r, s] = await Promise.all([inventoryApi.getRecipe(productId), inventoryApi.getItems()]);
    const sizeNames = new Set(r.product.variants.map((v) => v.name.toLowerCase()));
    const all = toDraft(r);
    const orphans = [...new Set(all.filter((l) => l.variantName && !sizeNames.has(l.variantName.toLowerCase())).map((l) => l.variantName!))];
    const d = all.filter((l) => !l.variantName || sizeNames.has(l.variantName.toLowerCase()));
    setRecipe(r);
    setStock(s);
    setLines(d);
    setSaved(signature(all)); // orphans hate → dirty, owner save karke saaf kare
    setOrphanSizes(orphans);
    loadedOnce.current = true;
  });

  const stockById = useMemo(() => new Map(stock.map((s) => [s.id, s])), [stock]);
  // Recipe mein aisa item ho jo stock list mein nahi (archive ke beech) — naam recipe se
  const nameOf = (id: string) => stockById.get(id)?.name ?? recipe?.lines.find((l) => l.inventoryItemId === id)?.itemName ?? 'Removed item';
  const unitOf = (id: string) => stockById.get(id)?.unit ?? recipe?.lines.find((l) => l.inventoryItemId === id)?.itemUnit ?? 'pcs';

  const dirty = recipe !== null && signature(lines) !== saved;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'Your recipe changes are not saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation]);

  const variants = recipe?.product.variants ?? [];
  const groupLines = lines.filter((l) => (size === null ? l.variantName === null : l.variantName === size));
  const sizeUsesDefault = size !== null && groupLines.length === 0;
  const shownLines = sizeUsesDefault ? lines.filter((l) => l.variantName === null) : groupLines;

  // Live cost — chuna hua size (ya bina sizes wala product)
  const cost = useMemo(() => {
    let total = 0;
    let missingCost = false;
    for (const l of shownLines) {
      const item = stockById.get(l.inventoryItemId);
      const q = parseQty(l.qty);
      if (!item || q === null) continue;
      const inItemUnit = convertQty(q, l.unit, item.unit);
      if (inItemUnit === null) continue;
      if (!(item.costPerUnit ?? 0)) missingCost = true;
      total += inItemUnit * (item.costPerUnit ?? 0);
    }
    const price =
      size !== null
        ? variants.find((v) => v.name === size)?.price ?? recipe?.product.price ?? 0
        : variants.length > 0
          ? Math.min(...variants.map((v) => v.price))
          : recipe?.product.price ?? 0;
    return { total, price, margin: price - total, pct: price > 0 ? (total / price) * 100 : 0, missingCost };
  }, [shownLines, stockById, size, variants, recipe]);

  const updateLine = (key: string, patch: Partial<Draft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => {
    haptics.tap();
    setLines((ls) => ls.filter((l) => l.key !== key));
  };

  const addIngredient = (item: InventoryItem) => {
    haptics.tap();
    setLines((ls) => [...ls, { key: newKey(), variantName: size, inventoryItemId: item.id, qty: '', unit: recipeDefaultUnit(item.unit) }]);
    setPickerOpen(false);
    setPickerSearch('');
  };

  const makeOwnRecipe = () => {
    if (size === null) return;
    haptics.tap();
    const base = lines.filter((l) => l.variantName === null);
    setLines((ls) => [...ls, ...base.map((l) => ({ ...l, key: newKey(), variantName: size }))]);
  };
  const useDefault = () => {
    if (size === null) return;
    Alert.alert(`Use the All sizes recipe for ${size}?`, `The separate ${size} recipe will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use All sizes', style: 'destructive', onPress: () => setLines((ls) => ls.filter((l) => l.variantName !== size)) },
    ]);
  };

  const save = async () => {
    if (!recipe || saving) return;
    const bad = lines.find((l) => {
      const q = parseQty(l.qty);
      return q === null || q <= 0;
    });
    if (bad) {
      haptics.error();
      if (bad.variantName !== size) setSize(bad.variantName);
      Alert.alert('Quantity missing', `Enter how much ${nameOf(bad.inventoryItemId)} goes into one ${recipe.product.name}${bad.variantName ? ` (${bad.variantName})` : ''}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await inventoryApi.saveRecipe(
        recipe.product.id,
        lines.map((l) => ({ variantName: l.variantName, inventoryItemId: l.inventoryItemId, quantity: parseQty(l.qty)!, unit: l.unit }))
      );
      const d = toDraft(res);
      setRecipe(res);
      setLines(d);
      setSaved(signature(d));
      setOrphanSizes([]);
      haptics.success();
      Alert.alert('Recipe saved', 'Stock will now go down by itself with every bill of this item.');
    } catch (err) {
      haptics.error();
      Alert.alert('Recipe not saved', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const pickable = useMemo(() => {
    const used = new Set(groupLines.map((l) => l.inventoryItemId));
    const q = pickerSearch.trim().toLowerCase();
    return stock.filter((s) => !used.has(s.id) && (q ? s.name.toLowerCase().includes(q) : true));
  }, [stock, groupLines, pickerSearch]);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
        <ArrowLeft size={19} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>Recipe</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  if (loading && !recipe) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <View style={styles.content}>
          <Skeleton height={60} radius={theme.radius.md} />
          <Skeleton height={200} radius={theme.radius.lg} />
          <Skeleton height={120} radius={theme.radius.lg} />
        </View>
      </SafeAreaView>
    );
  }
  if (!recipe) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <ErrorState message={error ?? 'This menu item was not found.'} onRetry={retry} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {header}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={styles.title}>{recipe.product.name}</Text>
            <Text style={styles.subtitle}>What goes into one serving. Stock goes down by this much with every bill.</Text>
          </View>

          {orphanSizes.length > 0 && (
            <View style={styles.orphan}>
              <Info size={16} color={theme.colors.warning} />
              <Text style={styles.orphanText}>
                The recipe for {orphanSizes.join(', ')} was removed because that size is no longer on the menu. Save to confirm.
              </Text>
            </View>
          )}

          {/* Sizes */}
          {variants.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sizeRow}>
              {[null, ...variants.map((v) => v.name)].map((name) => {
                const active = size === name;
                const own = name !== null && lines.some((l) => l.variantName === name);
                return (
                  <Pressable
                    key={name ?? '__all'}
                    style={[styles.sizeChip, active && styles.sizeChipActive]}
                    onPress={() => { haptics.tap(); setSize(name); }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.sizeText, active && styles.sizeTextActive]}>{name ?? 'All sizes'}</Text>
                    {own && <View style={[styles.ownDot, active && { backgroundColor: theme.colors.accentLight }]} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          {sizeUsesDefault ? (
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Info size={16} color={theme.colors.textSecondary} />
                <Text style={styles.infoText}>
                  {size} uses the All sizes recipe{shownLines.length === 0 ? ', which is empty' : ''}.
                </Text>
              </View>
              <Button title={`Use a different recipe for ${size}`} variant="secondary" onPress={makeOwnRecipe} />
            </View>
          ) : (
            <View style={styles.card}>
              {groupLines.length === 0 ? (
                <Text style={styles.emptyText}>
                  No ingredients yet. Add what goes into one {recipe.product.name}, like milk, coffee and the cup.
                </Text>
              ) : (
                groupLines.map((l, i) => {
                  const itemUnit = unitOf(l.inventoryItemId);
                  const units = compatibleUnits(itemUnit);
                  const item = stockById.get(l.inventoryItemId);
                  const q = parseQty(l.qty);
                  const conv = q !== null ? convertQty(q, l.unit, itemUnit) : null;
                  const lineCost = conv !== null && item ? conv * (item.costPerUnit ?? 0) : 0;
                  const invalid = l.qty !== '' && (q === null || q <= 0);
                  return (
                    <View key={l.key} style={[styles.line, i > 0 && styles.lineBorder]}>
                      <View style={styles.lineTop}>
                        <Text style={styles.lineName} numberOfLines={1}>{nameOf(l.inventoryItemId)}</Text>
                        {lineCost > 0 && <Text style={styles.lineCost}>{formatINR(lineCost)}</Text>}
                        <Pressable onPress={() => removeLine(l.key)} hitSlop={8} style={styles.removeBtn} accessibilityLabel={`Remove ${nameOf(l.inventoryItemId)}`}>
                          <X size={16} color={theme.colors.textMuted} />
                        </Pressable>
                      </View>
                      <View style={styles.lineBottom}>
                        <TextInput
                          style={[styles.qtyInput, invalid && { borderColor: theme.colors.danger }]}
                          value={l.qty}
                          onChangeText={(t) => updateLine(l.key, { qty: cleanQtyInput(t) })}
                          keyboardType="decimal-pad"
                          placeholder="Qty"
                          placeholderTextColor={theme.colors.textMuted}
                          selectionColor={theme.colors.accent}
                          cursorColor={theme.colors.accent}
                          accessibilityLabel={`Quantity of ${nameOf(l.inventoryItemId)}`}
                        />
                        <View style={styles.unitSeg}>
                          {units.map((u) => {
                            const active = l.unit === u;
                            return (
                              <Pressable
                                key={u}
                                style={[styles.unitBtn, active && styles.unitBtnActive]}
                                onPress={() => updateLine(l.key, { unit: u })}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: active }}
                              >
                                <Text style={[styles.unitText, active && styles.unitTextActive]}>{u}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {item && (
                          <Text style={styles.inStock} numberOfLines={1}>
                            {formatQty(item.quantity, item.unit)} in stock
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })
              )}
              <Pressable style={styles.addLine} onPress={() => { haptics.tap(); setPickerOpen(true); }} accessibilityRole="button">
                <Plus size={16} color={theme.colors.accentInk} />
                <Text style={styles.addLineText}>Add ingredient</Text>
              </Pressable>
              {size !== null && groupLines.length > 0 && (
                <Pressable style={styles.useDefault} onPress={useDefault} accessibilityRole="button">
                  <Text style={styles.useDefaultText}>Use the All sizes recipe instead</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* Cost */}
          {shownLines.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                Cost per {recipe.product.name}
                {size ? ` (${size})` : variants.length > 0 ? ` (${variants.reduce((a, b) => (b.price < a.price ? b : a)).name})` : ''}
              </Text>
              <View style={styles.costRow}>
                <CostCell label="Ingredients" value={formatINR(cost.total)} />
                <CostCell label="Selling price" value={formatINR(cost.price)} />
                <CostCell label="You keep" value={formatINR(cost.margin)} color={cost.margin < 0 ? theme.colors.danger : theme.colors.textPrimary} />
              </View>
              {cost.price > 0 && cost.total > 0 && (
                <View style={styles.pctRow}>
                  <View style={styles.pctTrack}>
                    <View style={[styles.pctFill, { width: `${Math.min(100, cost.pct)}%`, backgroundColor: foodCostColor(cost.pct) }]} />
                  </View>
                  <Text style={[styles.pctText, { color: foodCostColor(cost.pct) }]}>{Math.round(cost.pct)}% food cost</Text>
                </View>
              )}
              <Text style={styles.hint}>
                {cost.missingCost
                  ? 'Some ingredients have no cost yet. Add cost per unit on the Stock screen for an exact number.'
                  : 'Most cafés aim for 25–35% food cost.'}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button title={dirty ? 'Save recipe' : 'Saved'} onPress={save} loading={saving} disabled={!dirty} />
        </View>
      </KeyboardAvoidingView>

      {/* Ingredient picker */}
      <BottomSheet visible={pickerOpen} onClose={() => setPickerOpen(false)} title="Add ingredient">
        {stock.length === 0 ? (
          <View style={{ gap: theme.spacing.md }}>
            <Text style={styles.emptyText}>Your stock list is empty. Add items like milk, coffee beans and cups first.</Text>
            <Button
              title="Add stock item"
              onPress={() => { setPickerOpen(false); router.push('/(admin)/inventory/create'); }}
            />
          </View>
        ) : (
          <>
            <View style={styles.searchBar}>
              <Search size={17} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search stock"
                placeholderTextColor={theme.colors.textMuted}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                selectionColor={theme.colors.accent}
                cursorColor={theme.colors.accent}
              />
            </View>
            <FlatList
              data={pickable}
              keyExtractor={(s) => s.id}
              style={{ maxHeight: 320 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={({ pressed }) => [styles.pickRow, pressed && { opacity: 0.7 }]} onPress={() => addIngredient(item)} accessibilityRole="button">
                  <Package size={16} color={theme.colors.textSecondary} />
                  <Text style={styles.pickName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.pickMeta}>{formatQty(item.quantity, item.unit)}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{pickerSearch ? 'No match.' : 'Every stock item is already in this recipe.'}</Text>}
            />
            <Pressable
              style={styles.newStock}
              onPress={() => { setPickerOpen(false); router.push('/(admin)/inventory/create'); }}
              accessibilityRole="button"
            >
              <Plus size={16} color={theme.colors.accentInk} />
              <Text style={styles.addLineText}>New stock item</Text>
            </Pressable>
          </>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function CostCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.costLabel}>{label}</Text>
      <Text style={[styles.costValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  headerTitle: { ...ui.headerTitle },
  iconBtn: { ...ui.iconButton },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary },
  subtitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 20 },

  sizeRow: { gap: theme.spacing.sm },
  orphan: { flexDirection: 'row', gap: theme.spacing.sm, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.warningLight },
  orphanText: { flex: 1, fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary, lineHeight: 18 },
  sizeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 16, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  sizeChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  sizeText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  sizeTextActive: { color: theme.colors.white },
  ownDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.accent },

  card: { ...ui.card, padding: theme.spacing.lg },
  cardTitle: { ...ui.sectionTitle, marginBottom: theme.spacing.md },
  emptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20 },
  infoRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginBottom: theme.spacing.md },
  infoText: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20 },

  line: { paddingVertical: 12, gap: 8 },
  lineBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  lineName: { flex: 1, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  lineCost: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, ...NUM },
  removeBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  lineBottom: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  qtyInput: {
    width: 88, height: 42, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 10,
    fontSize: 16, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, backgroundColor: theme.colors.background, textAlign: 'right', ...NUM,
  },
  unitSeg: { flexDirection: 'row', backgroundColor: theme.colors.border, borderRadius: theme.radius.md, padding: 3 },
  unitBtn: { minWidth: 42, height: 36, borderRadius: theme.radius.md - 2, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  unitBtnActive: { backgroundColor: theme.colors.surface },
  unitText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  unitTextActive: { color: theme.colors.textPrimary },
  inStock: { flex: 1, textAlign: 'right', fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, ...NUM },
  addLine: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, marginTop: 4 },
  addLineText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },
  useDefault: { height: 40, justifyContent: 'center' },
  useDefaultText: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },

  costRow: { flexDirection: 'row', gap: theme.spacing.md },
  costLabel: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  costValue: { fontSize: 18, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 2, ...NUM },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginTop: theme.spacing.md },
  pctTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: 'hidden' },
  pctFill: { height: 8, borderRadius: 4 },
  pctText: { fontSize: 13, fontFamily: theme.typography.font.semibold, ...NUM },
  hint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: theme.spacing.sm, lineHeight: 17 },

  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.background, borderWidth: 1,
    borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12, height: 44, marginBottom: theme.spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, height: 48, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  pickName: { flex: 1, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
  pickMeta: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, ...NUM },
  newStock: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 48 },
});
