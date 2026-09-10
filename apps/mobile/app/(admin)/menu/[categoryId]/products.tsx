// app/(admin)/menu/[categoryId]/products.tsx
// USE CASE: Products list within a specific category. "Add Product" navigates to
//           create-product.tsx, passing the categoryId along.
// CONNECTED TO: menu.api.ts (getProducts filtered by categoryId).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Plus, Leaf, CircleDot, UtensilsCrossed } from 'lucide-react-native';
import { menuApi, Product } from '../../../../features/menu/menu.api';
import { theme } from '../../../../theme';

export default function ProductsScreen() {
  const router = useRouter();
  const { categoryId, categoryName } = useLocalSearchParams<{ categoryId: string; categoryName: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await menuApi.getProducts({ categoryId });
      setProducts(data);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{categoryName?.toUpperCase()}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>{categoryName}</Text>
        <Text style={styles.subtitle}>
          {products.length > 0 ? `${products.length} item${products.length === 1 ? '' : 's'}` : 'No items yet in this category'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.productCard, !item.isAvailable && styles.productCardDisabled]}>
              <View style={styles.vegBadge}>
                {item.isVeg ? <CircleDot size={10} color={theme.colors.success} fill={theme.colors.success} /> : <CircleDot size={10} color={theme.colors.danger} fill={theme.colors.danger} />}
              </View>
              <View style={styles.productTextWrap}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productMeta}>
                  ₹{item.price}
                  {item.variants.length > 0 ? ` · ${item.variants.length} variant${item.variants.length === 1 ? '' : 's'}` : ''}
                  {item.addons.length > 0 ? ` · ${item.addons.length} addon${item.addons.length === 1 ? '' : 's'}` : ''}
                </Text>
              </View>
              {!item.isAvailable && (
                <View style={styles.unavailablePill}>
                  <Text style={styles.unavailableText}>Unavailable</Text>
                </View>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBadge}>
                <UtensilsCrossed size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No items yet</Text>
              <Text style={styles.emptyText}>Add your first product to this category to start billing.</Text>
            </View>
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable
          style={styles.addButton}
          onPress={() => router.push({ pathname: '/(admin)/menu/[categoryId]/create-product', params: { categoryId } })}
        >
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add Product</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full, maxWidth: 200 },
  badgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.white, letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, color: theme.colors.textSecondary },
  listContent: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: theme.spacing.xl, flexGrow: 1 },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  productCardDisabled: { opacity: 0.55 },
  vegBadge: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  productTextWrap: { flex: 1, marginRight: theme.spacing.sm },
  productName: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  productMeta: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, marginTop: 2 },
  unavailablePill: { backgroundColor: theme.colors.dangerLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  unavailableText: { fontSize: 10, fontWeight: theme.typography.weight.semibold, color: theme.colors.danger },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingTop: theme.spacing.xxl },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 54, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});