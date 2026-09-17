// app/(cashier)/billing.tsx
// USE CASE: Cashier's home screen — category rail (left) + product grid (right) + a
//           persistent bottom cart bar. Redesigned to match the Dashboard's premium
//           visual language (soft-shadow white cards, dark-green accent, restrained
//           color). Products already in the cart show an inline +/- stepper directly
//           on the card instead of a flat "add" state, so the Cashier always sees
//           exactly what's in the order without leaving this screen.
// CONNECTED TO: menu.api.ts, cart.store.ts. Cart bar navigates to (cashier)/cart.tsx.

import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ShoppingCart, LogOut, Plus, Minus, Coffee } from 'lucide-react-native';
import { menuApi, Category, Product } from '../../features/menu/menu.api';
import { useCartStore } from '../../features/cart/cart.store';
import { useAuthStore } from '../../features/auth/auth.store';
import { VariantAddonModal } from '../../components/cashier/VariantAddonModal';
import { theme } from '../../theme';

export default function BillingScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const cartItems = useCartStore((s) => s.items);
  const totalItems = useCartStore((s) => s.totalItems());
  const subtotal = useCartStore((s) => s.subtotal());
  const addItem = useCartStore((s) => s.addItem);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([menuApi.getCategories(), menuApi.getProducts()]);
      setCategories(cats);
      setProducts(prods);
      setSelectedCategoryId((prev) => prev ?? (cats[0]?.id ?? null));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visibleProducts = useMemo(
    () => products.filter((p) => p.categoryId === selectedCategoryId),
    [products, selectedCategoryId]
  );

  // For a simple (no variant/addon) product, find its cart line directly by productId —
  // used to show the inline stepper instead of a flat "add" button once it's in the cart
  const simpleCartLine = (productId: string) => cartItems.find((i) => i.productId === productId && !i.variantId && i.addonIds.length === 0);

  const handleProductTap = (product: Product) => {
    if (!product.isAvailable) return;
    if (product.variants.length === 0 && product.addons.length === 0) {
      addItem(product, null, [], 1);
    } else {
      setModalProduct(product);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primaryDark} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Billing</Text>
          <Text style={styles.headerSubtitle}>{user?.outletName ?? 'Your Outlet'}</Text>
        </View>
        <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} onPress={logout}>
          <LogOut size={17} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* ── Category rail ── */}
        <View style={styles.categoryRail}>
          <FlatList
            data={categories}
            keyExtractor={(c) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: theme.spacing.sm }}
            renderItem={({ item }) => {
              const active = item.id === selectedCategoryId;
              return (
                <Pressable style={[styles.categoryPill, active && styles.categoryPillActive]} onPress={() => setSelectedCategoryId(item.id)}>
                  <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>

        {/* ── Product grid ── */}
        <View style={styles.productArea}>
          {visibleProducts.length === 0 ? (
            <View style={styles.centerFill}>
              <View style={styles.emptyIconBadge}>
                <Coffee size={26} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>No items in this category</Text>
            </View>
          ) : (
            <FlatList
              data={visibleProducts}
              keyExtractor={(p) => p.id}
              numColumns={2}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.productGrid}
              renderItem={({ item }) => {
                const cartLine = simpleCartLine(item.id);
                const hasChoices = item.variants.length > 0 || item.addons.length > 0;

                return (
                  <Pressable
                    style={[styles.productCard, !item.isAvailable && styles.productCardDisabled]}
                    onPress={() => handleProductTap(item)}
                    disabled={!item.isAvailable}
                  >
                    <View style={styles.productCardTop}>
                      <View style={[styles.vegDot, { borderColor: item.isVeg ? theme.colors.success : theme.colors.danger }]}>
                        <View style={[styles.vegDotInner, { backgroundColor: item.isVeg ? theme.colors.success : theme.colors.danger }]} />
                      </View>
                      {!item.isAvailable && (
                        <View style={styles.unavailablePill}>
                          <Text style={styles.unavailableText}>Sold Out</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.productPrice}>₹{item.price}</Text>

                    {hasChoices ? (
                      <View style={styles.optionsHint}>
                        <Text style={styles.optionsHintText}>
                          {item.variants.length > 0 ? `${item.variants.length} sizes` : `${item.addons.length} extras`}
                        </Text>
                      </View>
                    ) : cartLine ? (
                      <View style={styles.inlineStepper}>
                        <Pressable style={styles.stepperBtn} onPress={() => decrementItem(cartLine.key)} hitSlop={6}>
                          <Minus size={13} color={theme.colors.primaryDark} />
                        </Pressable>
                        <Text style={styles.stepperQty}>{cartLine.quantity}</Text>
                        <Pressable style={styles.stepperBtn} onPress={() => incrementItem(cartLine.key)} hitSlop={6}>
                          <Plus size={13} color={theme.colors.primaryDark} />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.addBadge}>
                        <Plus size={14} color={theme.colors.white} />
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>

      {/* ── Persistent cart bar ── */}
      {totalItems > 0 && (
        <Pressable style={({ pressed }) => [styles.cartBar, pressed && { opacity: 0.92 }]} onPress={() => router.push('/(cashier)/cart')}>
          <View style={styles.cartBadge}>
            <ShoppingCart size={15} color={theme.colors.white} />
            <Text style={styles.cartBadgeText}>{totalItems}</Text>
          </View>
          <Text style={styles.cartBarText}>{cartItems.length} item{cartItems.length === 1 ? '' : 's'}</Text>
          <Text style={styles.cartBarTotal}>₹{subtotal}</Text>
          <Text style={styles.cartBarAction}>View Cart →</Text>
        </Pressable>
      )}

      {modalProduct && (
        <VariantAddonModal
          product={modalProduct}
          onClose={() => setModalProduct(null)}
          onConfirm={(variant, addons, quantity, notes) => {
            addItem(modalProduct, variant, addons, quantity, notes);
            setModalProduct(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  headerSubtitle: { fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },

  body: { flex: 1, flexDirection: 'row' },

  categoryRail: { width: 96, backgroundColor: theme.colors.surface, borderRightWidth: 1, borderRightColor: theme.colors.border },
  categoryPill: {
    paddingVertical: theme.spacing.sm + 2,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.xs,
    alignItems: 'center',
  },
  categoryPillActive: { backgroundColor: theme.colors.primaryLight },
  categoryPillText: { fontSize: 12, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary, textAlign: 'center' },
  categoryPillTextActive: { color: theme.colors.primaryDark, fontWeight: theme.typography.weight.bold },

  productArea: { flex: 1, backgroundColor: theme.colors.background },
  productGrid: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  gridRow: { gap: theme.spacing.md },
  emptyIconBadge: { width: 60, height: 60, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.md },
  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted },

  productCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    minHeight: 110,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  productCardDisabled: { opacity: 0.5 },
  productCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.sm },
  vegDot: { width: 15, height: 15, borderRadius: 3, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  vegDotInner: { width: 6, height: 6, borderRadius: 3 },
  unavailablePill: { backgroundColor: theme.colors.dangerLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.radius.full },
  unavailableText: { fontSize: 9, fontWeight: theme.typography.weight.semibold, color: theme.colors.danger },
  productName: { fontSize: 13.5, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary, marginBottom: 4, minHeight: 34 },
  productPrice: { fontSize: 15, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },

  optionsHint: { alignSelf: 'flex-start', backgroundColor: theme.colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full },
  optionsHintText: { fontSize: 10, fontWeight: theme.typography.weight.medium, color: theme.colors.textMuted },

  addBadge: {
    alignSelf: 'flex-end',
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.full,
    paddingHorizontal: 4,
    height: 28,
    alignSelf: 'flex-start',
    minWidth: 76,
  },
  stepperBtn: { width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  stepperQty: { fontSize: 13, fontWeight: theme.typography.weight.bold, color: theme.colors.primaryDark, minWidth: 16, textAlign: 'center' },

  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primaryDark,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  cartBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  cartBadgeText: { color: theme.colors.white, fontSize: 12, fontWeight: theme.typography.weight.bold },
  cartBarText: { flex: 1, color: theme.colors.white, fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium },
  cartBarTotal: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, marginRight: theme.spacing.sm },
  cartBarAction: { color: theme.colors.white, fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold },
});