// app/(cashier)/billing.tsx

import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Plus, Minus, Coffee, Armchair, ShoppingBag, LogOut, Trash2, ShoppingCart, ArrowRight } from 'lucide-react-native';
import { menuApi, Category, Product } from '../../features/menu/menu.api';
import { useCartStore } from '../../features/cart/cart.store';
import { useAuthStore } from '../../features/auth/auth.store';
import { VariantAddonModal } from '../../components/cashier/VariantAddonModal';
import { theme } from '../../theme';

export default function BillingScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const cartItems = useCartStore((s) => s.items);
  const totalItems = useCartStore((s) => s.totalItems());
  const subtotal = useCartStore((s) => s.subtotal());
  const orderType = useCartStore((s) => s.orderType);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const addItem = useCartStore((s) => s.addItem);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);
  const removeItem = useCartStore((s) => s.removeItem);

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

  const visibleProducts = useMemo(() => {
    let list = products;
    if (selectedCategoryId) list = list.filter((p) => p.categoryId === selectedCategoryId);
    if (search.trim()) list = list.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
    return list;
  }, [products, selectedCategoryId, search]);

  const simpleCartLine = (productId: string) => cartItems.find((i) => i.productId === productId && !i.variantId && i.addonIds.length === 0);

  const handleProductTap = (product: Product) => {
    if (!product.isAvailable) return;
    if (product.variants.length === 0 && product.addons.length === 0) {
      addItem(product, null, [], 1);
    } else {
      setModalProduct(product);
    }
  };

  const estimatedTax = Math.round(subtotal * 0.05);
  const estimatedTotal = subtotal + estimatedTax;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Clean White Professional Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Billing</Text>
          <Text style={styles.headerSubtitle}>Create and manage customer orders</Text>
        </View>
        <View style={styles.orderContextBadge}>
          {orderType === 'DINE_IN' ? <Armchair size={14} color={theme.colors.primary} /> : <ShoppingBag size={14} color={theme.colors.primary} />}
          <Text style={styles.orderContextText}>{orderType === 'DINE_IN' && tableNumber ? `Table ${tableNumber}` : 'Takeaway'}</Text>
        </View>
        <Pressable style={styles.logoutBtn} onPress={logout} hitSlop={8}>
          <LogOut size={17} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Category Sidebar */}
        <View style={styles.sidebar}>
          <FlatList
            data={categories}
            keyExtractor={(c) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: theme.spacing.sm }}
            renderItem={({ item }) => {
              const active = item.id === selectedCategoryId;
              return (
                <Pressable style={[styles.sidebarItem, active && styles.sidebarItemActive]} onPress={() => setSelectedCategoryId(item.id)}>
                  <Coffee size={18} color={active ? theme.colors.primary : theme.colors.textMuted} />
                  <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]} numberOfLines={2}>{item.name}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        {/* Menu Area */}
        <View style={styles.menuArea}>
          <View style={styles.searchBar}>
            <Search size={17} color={theme.colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for items..."
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
            />
          </View>

          <FlatList
            data={visibleProducts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.menuList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No items found</Text>
              </View>
            }
            renderItem={({ item }) => {
              const cartLine = simpleCartLine(item.id);
              const hasChoices = item.variants.length > 0 || item.addons.length > 0;

              return (
                <Pressable
                  style={[styles.productRow, !!cartLine && styles.productRowActive, !item.isAvailable && styles.productRowDisabled]}
                  onPress={() => handleProductTap(item)}
                  disabled={!item.isAvailable}
                >
                  <View style={styles.productAvatar}>
                    <Coffee size={20} color={theme.colors.textSecondary} />
                  </View>

                  <View style={styles.productTextWrap}>
                    <Text style={styles.productName}>{item.name}</Text>
                    <Text style={styles.productSub} numberOfLines={1}>
                      {item.isVeg ? 'Veg' : 'Non-Veg'}{hasChoices ? ` · ${item.variants.length || item.addons.length} options` : ''}
                    </Text>
                    <Text style={styles.productPrice}>₹{item.price}</Text>
                  </View>

                  {!item.isAvailable ? (
                    <View style={styles.soldOutPill}><Text style={styles.soldOutText}>Sold Out</Text></View>
                  ) : hasChoices ? (
                    <View style={styles.addCircle}><Plus size={16} color={theme.colors.primary} /></View>
                  ) : cartLine ? (
                    <View style={styles.stepper}>
                      <Pressable style={styles.stepperBtn} onPress={() => decrementItem(cartLine.key)} hitSlop={6}>
                        <Minus size={14} color={theme.colors.primary} />
                      </Pressable>
                      <Text style={styles.stepperQty}>{cartLine.quantity}</Text>
                      <Pressable style={styles.stepperBtn} onPress={() => incrementItem(cartLine.key)} hitSlop={6}>
                        <Plus size={14} color={theme.colors.primary} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.addCircle}><Plus size={16} color={theme.colors.primary} /></View>
                  )}
                </Pressable>
              );
            }}
          />
        </View>
      </View>

      {/* Cart Summary */}
      {totalItems > 0 && (
        <View style={styles.summaryCard}>
          <FlatList
            data={cartItems}
            keyExtractor={(i) => i.key}
            style={{ maxHeight: 150 }}
            renderItem={({ item }) => (
              <View style={styles.summaryLine}>
                <View style={styles.summaryAvatar}>
                  <Coffee size={14} color={theme.colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.summaryLineName} numberOfLines={1}>{item.productName}</Text>
                  <Text style={styles.summaryLinePrice}>₹{item.unitPrice}</Text>
                </View>
                <View style={styles.summaryStepper}>
                  <Pressable style={styles.summaryStepperBtn} onPress={() => decrementItem(item.key)}>
                    <Minus size={12} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Text style={styles.summaryStepperQty}>{item.quantity}</Text>
                  <Pressable style={styles.summaryStepperBtn} onPress={() => incrementItem(item.key)}>
                    <Plus size={12} color={theme.colors.textPrimary} />
                  </Pressable>
                </View>
                <Pressable onPress={() => removeItem(item.key)} hitSlop={8} style={{ marginLeft: theme.spacing.sm }}>
                  <Trash2 size={16} color={theme.colors.danger} />
                </Pressable>
              </View>
            )}
          />

          <View style={styles.divider} />

          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>₹{subtotal}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax (5%)</Text>
            <Text style={styles.totalsValue}>₹{estimatedTax}</Text>
          </View>
          <View style={[styles.totalsRow, { marginTop: 4 }]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>₹{estimatedTotal}</Text>
          </View>

          <Pressable style={styles.cartBar} onPress={() => router.push('/(cashier)/cart')}>
            <View style={styles.cartBadge}>
              <ShoppingCart size={15} color="#FFFFFF" />
              <Text style={styles.cartBadgeText}>{totalItems}</Text>
            </View>
            <Text style={styles.cartBarText}>{cartItems.length} item{cartItems.length === 1 ? '' : 's'}</Text>
            <Text style={styles.cartBarTotal}>₹{estimatedTotal}</Text>
            <View style={styles.viewCartBtn}>
              <Text style={styles.viewCartText}>View Cart</Text>
              <ArrowRight size={14} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>
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
  safeArea: { flex: 1, backgroundColor: theme.colors.surface },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: 22, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  headerSubtitle: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 1 },
  orderContextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
  },
  orderContextText: { fontSize: 12, fontWeight: theme.typography.weight.semibold, color: theme.colors.primary },
  logoutBtn: { width: 36, height: 36, borderRadius: theme.radius.full, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },

  body: { flex: 1, flexDirection: 'row', backgroundColor: theme.colors.background },

  sidebar: { width: 88, backgroundColor: theme.colors.surface, borderRightWidth: 1, borderRightColor: theme.colors.border },
  sidebarItem: { alignItems: 'center', paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, marginBottom: theme.spacing.xs, gap: 4 },
  sidebarItemActive: { backgroundColor: theme.colors.primaryLight },
  sidebarLabel: { fontSize: 11, fontWeight: theme.typography.weight.medium, color: theme.colors.textMuted, textAlign: 'center' },
  sidebarLabelActive: { color: theme.colors.primary, fontWeight: theme.typography.weight.bold },

  menuArea: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    margin: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: theme.typography.size.sm, color: theme.colors.textPrimary },

  menuList: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl, gap: theme.spacing.sm },
  emptyState: { paddingTop: theme.spacing.xxl, alignItems: 'center' },
  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  productRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  productRowDisabled: { opacity: 0.5 },
  productAvatar: { width: 48, height: 48, borderRadius: theme.radius.md, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  productTextWrap: { flex: 1 },
  productName: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  productSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  productPrice: { fontSize: 14, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, marginTop: 4 },

  soldOutPill: { backgroundColor: theme.colors.dangerLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  soldOutText: { fontSize: 10, fontWeight: theme.typography.weight.semibold, color: theme.colors.danger },
  addCircle: { width: 32, height: 32, borderRadius: theme.radius.full, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.primaryLight, borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.sm, height: 32 },
  stepperBtn: { padding: 2 },
  stepperQty: { fontSize: 14, fontWeight: theme.typography.weight.bold, color: theme.colors.primary, minWidth: 16, textAlign: 'center' },

  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  summaryLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: theme.spacing.xs },
  summaryAvatar: { width: 32, height: 32, borderRadius: theme.radius.sm, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.sm },
  summaryLineName: { fontSize: 13, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary },
  summaryLinePrice: { fontSize: 11, color: theme.colors.textMuted },
  summaryStepper: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.background, borderRadius: theme.radius.full, paddingHorizontal: 6, height: 26 },
  summaryStepperBtn: { padding: 2 },
  summaryStepperQty: { fontSize: 12, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, minWidth: 14, textAlign: 'center' },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  totalsLabel: { fontSize: 12, color: theme.colors.textSecondary },
  totalsValue: { fontSize: 12, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary },
  grandTotalLabel: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  grandTotalValue: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.primary },

  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cartBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  cartBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: theme.typography.weight.bold },
  cartBarText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: theme.typography.weight.medium },
  cartBarTotal: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold },
  viewCartBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: theme.spacing.md, paddingVertical: 8, borderRadius: theme.radius.full },
  viewCartText: { color: '#FFFFFF', fontSize: 12, fontWeight: theme.typography.weight.bold },
});