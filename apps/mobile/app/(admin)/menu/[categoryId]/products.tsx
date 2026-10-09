// app/(admin)/menu/[categoryId]/products.tsx
// USE CASE: Products list within a specific category. "Add Product" navigates to
//           create-product.tsx, passing the categoryId along.
// CONNECTED TO: menu.api.ts (getProducts filtered by categoryId).
//
// FIX (2026-09-29): product card tap → edit screen (create-product.tsx edit mode),
// aur header mein category delete (trash) button. Pehle menu mein kuch bhi edit/delete
// nahi ho sakta tha.
//
// UI/UX PASS (2026-09-30): useScreenLoad (error + retry + pull-to-refresh), skeleton,
// FSSAI VegMark (pehle non-veg ke liye laal dot tha — Indian standard brown triangle hai),
// product icon/colour, "from ₹X" jab sizes hon.

import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, UtensilsCrossed, Trash2, ChevronRight, ChefHat } from 'lucide-react-native';
import { menuApi, Product } from '../../../../features/menu/menu.api';
// ADDED (2026-10-09): Stock SOP — har item pe recipe chip (cost + food cost %), tap → recipe editor
import { inventoryApi, RecipeSummary } from '../../../../features/inventory/inventory.api';
import { getErrorMessage } from '../../../../lib/api-client';
import { useScreenLoad } from '../../../../lib/use-screen-load';
import { getProductVisual } from '../../../../lib/product-visual';
import { SkeletonList } from '../../../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../../../components/ui/StateViews';
import { VegMark } from '../../../../components/ui/VegMark';
import { theme } from '../../../../theme';

import { formatINR } from '../../../../lib/format'; // UI REDESIGN (2026-10-08): ₹1,250 format
import { ui } from '../../../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
export default function ProductsScreen() {
  const router = useRouter();
  const { categoryId, categoryName } = useLocalSearchParams<{ categoryId: string; categoryName: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<RecipeSummary>({});

  const { loading, refreshing, error, refresh, retry } = useScreenLoad(async () => {
    // Recipe summary fail ho (purana backend) to bhi menu dikhe — chip bas "Add recipe" rahega
    const [list, summary] = await Promise.all([
      menuApi.getProducts({ categoryId }),
      inventoryApi.getRecipeSummary().catch(() => ({} as RecipeSummary)),
    ]);
    setProducts(list);
    setRecipes(summary);
  });

  const goToAddProduct = () =>
    router.push({ pathname: '/(admin)/menu/[categoryId]/create-product', params: { categoryId } });

  const handleDeleteCategory = () => {
    if (products.length > 0) {
      Alert.alert('Category not empty', `Delete or move the ${products.length} item(s) in "${categoryName}" first.`);
      return;
    }
    Alert.alert(`Delete "${categoryName}"?`, 'This category will be removed from your menu.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await menuApi.deleteCategory(categoryId);
            router.back();
          } catch (err) {
            Alert.alert('Could not delete', getErrorMessage(err));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View /* UI REDESIGN (2026-10-08): ALL-CAPS eyebrow badge hataya (title dobara bolta tha) */ />
        <Pressable onPress={handleDeleteCategory} hitSlop={10} style={styles.backButton} accessibilityLabel="Delete category">
          <Trash2 size={19} color={theme.colors.danger} />
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{categoryName}</Text>
        <Text style={styles.subtitle}>
          {products.length > 0 ? `${products.length} item${products.length === 1 ? '' : 's'}` : 'No items yet in this category'}
        </Text>
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : error && products.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          renderItem={({ item }) => {
            const visual = getProductVisual(item.name);
            const VisualIcon = visual.icon;
            return (
            <Pressable
              style={({ pressed }) => [styles.productCard, !item.isAvailable && styles.productCardDisabled, pressed && { opacity: 0.92, transform: [{ scale: 0.98 }] }]}
              onPress={() =>
                router.push({
                  pathname: '/(admin)/menu/[categoryId]/create-product',
                  params: { categoryId, productId: item.id },
                })
              }
            >
              <View style={[styles.productAvatar, { backgroundColor: visual.bg }]}>
                <VisualIcon size={20} color={visual.color} />
              </View>
              <View style={styles.productTextWrap}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <VegMark isVeg={item.isVeg} size={12} />
                  <Text style={[styles.productName, { flexShrink: 1 }]} numberOfLines={1}>{item.name}</Text>
                </View>
                <Text style={styles.productMeta}>
                  {item.variants.length > 0 ? `from ${formatINR(Math.min(...item.variants.map((v) => v.price)))}` : formatINR(item.price)}
                  {item.variants.length > 0 ? ` · ${item.variants.length} variant${item.variants.length === 1 ? '' : 's'}` : ''}
                  {item.addons.length > 0 ? ` · ${item.addons.length} addon${item.addons.length === 1 ? '' : 's'}` : ''}
                </Text>
                {/* ADDED (2026-10-09): recipe chip — alag tap target (row tap = edit item) */}
                <Pressable
                  style={({ pressed }) => [styles.recipeChip, !recipes[item.id] && styles.recipeChipEmpty, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push({ pathname: '/(admin)/menu/recipe', params: { productId: item.id } })}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={recipes[item.id] ? `Recipe for ${item.name}. Cost ${formatINR(recipes[item.id].cost)}` : `Add recipe for ${item.name}`}
                >
                  <ChefHat size={12} color={recipes[item.id] ? theme.colors.primary : theme.colors.accentInk} />
                  <Text style={[styles.recipeChipText, !recipes[item.id] && { color: theme.colors.accentInk }]}>
                    {recipes[item.id]
                      ? recipes[item.id].cost > 0
                        ? `Cost ${formatINR(recipes[item.id].cost)} · ${Math.round(recipes[item.id].foodCostPct)}%`
                        : `Recipe · ${recipes[item.id].lineCount} item${recipes[item.id].lineCount === 1 ? '' : 's'}`
                      : 'Add recipe'}
                  </Text>
                </Pressable>
              </View>
              {!item.isAvailable && (
                <View style={styles.unavailablePill}>
                  <Text style={styles.unavailableText}>Unavailable</Text>
                </View>
              )}
              <ChevronRight size={16} color={theme.colors.textMuted} style={{ marginLeft: theme.spacing.sm }} />
            </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={UtensilsCrossed}
              title="No items yet"
              message="Add your first product to this category to start billing."
              actionLabel="Add first item"
              onAction={goToAddProduct}
            />
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={goToAddProduct}>
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add item</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  backButton: { ...ui.iconButton },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full, maxWidth: 200 },
  badgeText: { fontSize: 11, fontFamily: theme.typography.font.bold, color: theme.colors.white, letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: theme.spacing.xl, flexGrow: 1 },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    shadowColor: '#2B1F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardDisabled: { opacity: 0.55 },
  productAvatar: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  productTextWrap: { flex: 1, marginRight: theme.spacing.sm },
  productName: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  productMeta: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  // ADDED (2026-10-09): recipe chip
  recipeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, height: 26, paddingHorizontal: 10, borderRadius: theme.radius.full, backgroundColor: theme.colors.primaryLight },
  recipeChipEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border, borderStyle: 'dashed' },
  recipeChipText: { fontSize: 12, fontFamily: theme.typography.font.semibold, color: theme.colors.primary, fontVariant: ['tabular-nums'] },
  unavailablePill: { backgroundColor: theme.colors.dangerLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  unavailableText: { fontSize: 11, fontFamily: theme.typography.font.semibold, color: theme.colors.danger },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingTop: theme.spacing.xxl },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.background } /* UI REDESIGN (2026-10-08): separator line hataya */,
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' } /* UI REDESIGN (2026-10-08): brown glow shadow hataya */,
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});