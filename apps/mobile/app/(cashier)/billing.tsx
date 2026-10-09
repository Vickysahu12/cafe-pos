// app/(cashier)/billing.tsx
// USE CASE: Cashier's home screen — create a new order (product grid + cart), AND
// see live incoming orders right here (the strip below the header), instead of
// needing to switch to a separate Orders tab to notice a new QR order came in.
// CONNECTED TO: features/orders/useActiveOrders.ts for the live strip.
//
// UI/UX PASS (2026-09-30):
//  - Loading: spinner → skeleton (sidebar + product rows), layout jump nahi hota
//  - Load fail pe ErrorState + "Try Again" (pehle blank screen reh jaati thi)
//  - Pull-to-refresh menu pe (naya item / price change turant dikhe)
//  - Har item + category ka apna icon/colour (pehle sab pe "Coffee" icon tha)
//  - FSSAI veg/non-veg mark (VegMark) text ki jagah
//  - Haptic tap feedback on add / +/-
//  - Logout pe confirm (galti se tap = shift ke beech logout ho jaata tha)
//  - Menu search clear (X) button, "Search for items" pe category bhi respect hoti hai
//
// UI REDESIGN (2026-10-08) — speed pe focus (cashier din mein saikdon baar use karta hai):
//  - Header: filler subtitle hataya; order type chip + logout
//  - Live strip: chips mein customer ka naam + status dot
//  - Category rail: active = espresso fill (ek nazar mein dikhe)
//  - Item row: PressScale (press feel), bada "+ Add" button (36px), cart mein ho to espresso
//    stepper (34×36 targets); "from ₹X · customisable" ek line mein
//  - Cart panel slim: "2× Cappuccino … ₹280", steppers, ek line "Items · GST", aur bada
//    "Review order ₹X →" (pehle avatar + 3 total rows + chhota button — menu dab jaata tha)
//  - Tabular numbers, haptic: ek tap = ek haptic

import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Search, Plus, Minus, Armchair, ShoppingBag, LogOut, Trash2, ArrowRight, ChevronRight, X, UtensilsCrossed } from 'lucide-react-native';
import { menuApi, Category, Product } from '../../features/menu/menu.api';
import { useCartStore } from '../../features/cart/cart.store';
import { useAuthStore } from '../../features/auth/auth.store';
import { useActiveOrders } from '../../features/orders/useActiveOrders';
import { VariantAddonModal } from '../../components/cashier/VariantAddonModal';
import { Skeleton } from '../../components/ui/Skeleton';
import { PressScale } from '../../components/ui/PressScale';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { VegMark } from '../../components/ui/VegMark';
import { getProductVisual } from '../../lib/product-visual';
import { haptics } from '../../lib/haptics';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';
import { useFlowBase } from '../../lib/use-flow-base'; // ADDED (2026-10-09): cashier + owner dono groups
import { formatINR } from '../../lib/format'; // UI REDESIGN (2026-10-08): ₹1,250 format, float ka kachra nahi
import { ui } from '../../theme/ui';

// Only orders that genuinely need the Cashier's attention right now show in the
// strip — SERVED/CANCELLED ones belong in the full Orders tab, not here.
const NEEDS_ATTENTION = ['PENDING', 'PREPARING', 'READY'];

const STATUS_DOT: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'New', color: theme.colors.danger },
  PREPARING: { label: 'Preparing', color: theme.colors.warning },
  READY: { label: 'Ready', color: theme.colors.success },
};

export default function BillingScreen() {
  const router = useRouter();
  const base = useFlowBase(); // ADDED (2026-10-09): '/(admin)' ya '/(cashier)'
  const logout = useAuthStore((s) => s.logout);

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  // Same live data source the Orders tab uses — a new QR order shows up here
  // the instant it's created, no tab switch needed.
  const { orders: liveOrders } = useActiveOrders();
  const attentionOrders = useMemo(
    () => liveOrders.filter((o) => NEEDS_ATTENTION.includes(o.orderStatus)),
    [liveOrders]
  );

  const load = useCallback(async () => {
    try {
      const [cats, prods] = await Promise.all([menuApi.getCategories(), menuApi.getProducts()]);
      setCategories(cats);
      setProducts(prods);
      // Selected category delete ho gayi ho to pehli category pe wapas
      setSelectedCategoryId((prev) => (prev && cats.some((c) => c.id === prev) ? prev : cats[0]?.id ?? null));
      setLoadError(null);
    } catch (err) {
      // Pehle se menu dikh raha ho (refresh fail) to purana data rehne do, sirf pehli load pe error screen
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'You will need your password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

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
      haptics.tap();
      addItem(product, null, [], 1);
    } else {
      setModalProduct(product);
    }
  };

  // FIX (2026-09-30): pehle flat 5% estimate tha — ab har product ka asli GST (backend jaisa hi hisaab)
  const estimatedTax = useCartStore((s) => s.taxTotal());
  const estimatedTotal = useCartStore((s) => s.grandTotal());

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Skeleton width={90} height={24} />
          </View>
          <Skeleton width={100} height={36} radius={theme.radius.full} />
        </View>
        <View style={styles.body}>
          <View style={[styles.sidebar, { padding: 8, gap: 8 }]}>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={62} radius={theme.radius.md} />
            ))}
          </View>
          <View style={[styles.menuArea, { padding: 12, gap: 10 }]}>
            <Skeleton height={44} radius={theme.radius.md} />
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} height={72} radius={theme.radius.lg} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Pehli load hi fail (menu kabhi aaya hi nahi) → error + retry
  if (loadError && products.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState message={loadError} onRetry={() => { setLoading(true); load(); }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Billing</Text>
        <View style={styles.orderContextChip}>
          {orderType === 'DINE_IN' ? <Armchair size={15} color={theme.colors.primary} /> : <ShoppingBag size={15} color={theme.colors.primary} />}
          <Text style={styles.orderContextText}>{orderType === 'DINE_IN' && tableNumber ? `Table ${tableNumber}` : 'Takeaway'}</Text>
        </View>
        {/* ADDED (2026-10-09): logout sirf cashier app mein — Owner/Manager Settings se logout karte hain */}
        {base === '/(cashier)' && (
          <Pressable style={styles.iconBtn} onPress={confirmLogout} hitSlop={4} accessibilityLabel="Log out">
            <LogOut size={18} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </View>

      {/* ── Live orders (sirf jab kuch dhyan maange) ── */}
      {attentionOrders.length > 0 && (
        <View style={styles.liveStrip}>
          <View style={styles.liveStripHeader}>
            <View style={styles.liveDot} />
            <Text style={styles.liveStripTitle}>
              {attentionOrders.length} order{attentionOrders.length > 1 ? 's' : ''} in progress
            </Text>
            <Pressable style={styles.liveStripLink} hitSlop={10} onPress={() => router.push(`${base}/orders`)}>
              <Text style={styles.liveStripLinkText}>View all</Text>
              <ChevronRight size={14} color={theme.colors.accentInk} />
            </Pressable>
          </View>
          <FlatList
            data={attentionOrders}
            keyExtractor={(o) => o.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.liveStripList}
            renderItem={({ item }) => {
              const meta = STATUS_DOT[item.orderStatus];
              return (
                <PressScale style={styles.orderChip} onPress={() => router.push(`${base}/orders/${item.id}`)}>
                  <View style={styles.orderChipTop}>
                    <Text style={styles.orderChipNumber}>#{item.orderNumber}</Text>
                    <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                    <Text style={[styles.orderChipStatus, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.orderChipMeta} numberOfLines={1}>
                    {item.customerName ? `${item.customerName} · ` : ''}
                    {item.table ? `Table ${item.table.tableNumber}` : item.orderType === 'DINE_IN' ? 'Dine-in' : 'Takeaway'}
                  </Text>
                </PressScale>
              );
            }}
          />
        </View>
      )}

      <View style={styles.body}>
        {/* ── Categories ── */}
        <View style={styles.sidebar}>
          <FlatList
            data={categories}
            keyExtractor={(c) => c.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 8, gap: 6 }}
            renderItem={({ item }) => {
              const active = item.id === selectedCategoryId;
              const CatIcon = getProductVisual(item.name).icon;
              return (
                <Pressable
                  style={[styles.sidebarItem, active && styles.sidebarItemActive]}
                  onPress={() => setSelectedCategoryId(item.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <CatIcon size={19} color={active ? theme.colors.white : theme.colors.textSecondary} />
                  <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]} numberOfLines={2}>{item.name}</Text>
                </Pressable>
              );
            }}
          />
        </View>

        {/* ── Menu ── */}
        <View style={styles.menuArea}>
          <View style={styles.searchBar}>
            <Search size={17} color={theme.colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search items"
              placeholderTextColor={theme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              selectionColor={theme.colors.accent}
              cursorColor={theme.colors.accent}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                <X size={16} color={theme.colors.textMuted} />
              </Pressable>
            )}
          </View>

          <FlatList
            data={visibleProducts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.menuList}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
            ListEmptyComponent={
              products.length === 0 ? (
                <EmptyState icon={UtensilsCrossed} title="Menu is empty" message="Ask your Owner or Manager to add items from the Menu screen." />
              ) : (
                <EmptyState icon={Search} title="No items found" message={search ? `Nothing matches "${search}"` : 'This category has no items yet.'} />
              )
            }
            renderItem={({ item }) => {
              const cartLine = simpleCartLine(item.id);
              const hasChoices = item.variants.length > 0 || item.addons.length > 0;
              const visual = getProductVisual(item.name);
              const VisualIcon = visual.icon;
              const inCart = !!cartLine;

              return (
                <PressScale
                  style={[styles.productRow, inCart && styles.productRowActive, !item.isAvailable && styles.productRowDisabled]}
                  onPress={item.isAvailable ? () => handleProductTap(item) : undefined}
                  haptic={false} /* handleProductTap khud haptic deta hai — ek tap = ek haptic */
                  pressedScale={0.98}
                  accessibilityLabel={`${item.name}, ₹${item.variants.length > 0 ? Math.min(...item.variants.map((v) => v.price)) : item.price}${item.isAvailable ? '' : ', sold out'}`}
                >
                  <View style={[styles.productAvatar, { backgroundColor: visual.bg }]}>
                    <VisualIcon size={22} color={visual.color} />
                  </View>

                  <View style={styles.productTextWrap}>
                    <View style={styles.productNameRow}>
                      <VegMark isVeg={item.isVeg} size={12} />
                      <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                    </View>
                    <Text style={styles.productPrice}>
                      {item.variants.length > 0 ? (
                        <Text style={styles.productFrom}>from </Text>
                      ) : null}
                      {formatINR(item.variants.length > 0 ? Math.min(...item.variants.map((v) => v.price)) : item.price)}
                      {hasChoices ? <Text style={styles.productFrom}>  ·  customisable</Text> : null}
                    </Text>
                  </View>

                  {!item.isAvailable ? (
                    <View style={styles.soldOutPill}><Text style={styles.soldOutText}>Sold out</Text></View>
                  ) : cartLine && !hasChoices ? (
                    <View style={styles.stepper}>
                      <Pressable
                        style={styles.stepperBtn}
                        onPress={() => { haptics.tap(); decrementItem(cartLine.key); }}
                        hitSlop={6}
                        accessibilityLabel={`Remove one ${item.name}`}
                      >
                        <Minus size={15} color={theme.colors.white} />
                      </Pressable>
                      <Text style={styles.stepperQty}>{cartLine.quantity}</Text>
                      <Pressable
                        style={styles.stepperBtn}
                        onPress={() => { haptics.tap(); incrementItem(cartLine.key); }}
                        hitSlop={6}
                        accessibilityLabel={`Add one more ${item.name}`}
                      >
                        <Plus size={15} color={theme.colors.white} />
                      </Pressable>
                    </View>
                  ) : (
                    <View style={styles.addBtn}>
                      <Plus size={15} color={theme.colors.primary} />
                      <Text style={styles.addBtnText}>Add</Text>
                    </View>
                  )}
                </PressScale>
              );
            }}
          />
        </View>
      </View>

      {/* ── Cart (slim — menu dikhta rahe) ── */}
      {totalItems > 0 && (
        <View style={styles.summaryCard}>
          <FlatList
            data={cartItems}
            keyExtractor={(i) => i.key}
            style={{ maxHeight: 132 }}
            renderItem={({ item }) => (
              <View style={styles.summaryLine}>
                <Text style={styles.summaryQty}>{item.quantity}×</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.summaryLineName} numberOfLines={1}>
                    {item.productName}{item.variantName ? ` (${item.variantName})` : ''}
                  </Text>
                  {item.addonNames.length > 0 && (
                    <Text style={styles.summaryLineSub} numberOfLines={1}>+ {item.addonNames.join(', ')}</Text>
                  )}
                </View>
                <View style={styles.summaryStepper}>
                  <Pressable style={styles.summaryStepperBtn} onPress={() => { haptics.tap(); decrementItem(item.key); }} hitSlop={6} accessibilityLabel={`Remove one ${item.productName}`}>
                    <Minus size={13} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Pressable style={styles.summaryStepperBtn} onPress={() => { haptics.tap(); incrementItem(item.key); }} hitSlop={6} accessibilityLabel={`Add one more ${item.productName}`}>
                    <Plus size={13} color={theme.colors.textPrimary} />
                  </Pressable>
                </View>
                <Text style={styles.summaryLineTotal}>{formatINR(item.unitPrice * item.quantity)}</Text>
                <Pressable onPress={() => removeItem(item.key)} hitSlop={10} accessibilityLabel={`Remove ${item.productName}`}>
                  <Trash2 size={16} color={theme.colors.textMuted} />
                </Pressable>
              </View>
            )}
          />

          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              Items {formatINR(subtotal)}  ·  GST {formatINR(estimatedTax)}
            </Text>
          </View>

          <PressScale style={styles.cartBar} onPress={() => router.push(`${base}/cart`)} pressedScale={0.98} accessibilityLabel={`Review order, ${totalItems} items, total ₹${estimatedTotal}`}>
            <View style={styles.cartBadge}>
              <Text style={styles.cartBadgeText}>{totalItems}</Text>
            </View>
            <Text style={styles.cartBarText}>Review order</Text>
            <Text style={styles.cartBarTotal}>{formatINR(estimatedTotal)}</Text>
            <ArrowRight size={18} color={theme.colors.white} />
          </PressScale>
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

const NUM = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  headerTitle: { flex: 1, fontSize: 24, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  orderContextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  orderContextText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.primary },
  iconBtn: { ...ui.iconButton },

  // Live strip
  liveStrip: { paddingBottom: 10 },
  liveStripHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, marginBottom: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.success },
  liveStripTitle: { flex: 1, fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  liveStripLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  liveStripLinkText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },
  liveStripList: { paddingHorizontal: 16, gap: 8 },
  orderChip: { ...ui.card, paddingHorizontal: 12, paddingVertical: 9, minWidth: 128 },
  orderChipTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  orderChipNumber: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginRight: 4, ...NUM },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  orderChipStatus: { fontSize: 12, fontFamily: theme.typography.font.semibold },
  orderChipMeta: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 3, maxWidth: 170 },

  body: { flex: 1, flexDirection: 'row' },

  // Category rail
  sidebar: { width: 86, borderRightWidth: 1, borderRightColor: theme.colors.border },
  sidebarItem: { alignItems: 'center', paddingVertical: 10, paddingHorizontal: 4, borderRadius: theme.radius.md, gap: 5 },
  sidebarItemActive: { backgroundColor: theme.colors.primary },
  sidebarLabel: { fontSize: 11, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, textAlign: 'center' },
  sidebarLabelActive: { color: theme.colors.white, fontFamily: theme.typography.font.semibold },

  // Menu
  menuArea: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary },
  menuList: { paddingHorizontal: 12, paddingBottom: 20, gap: 8 },

  productRow: { ...ui.card, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 10 },
  productRowActive: { borderColor: theme.colors.primary, borderWidth: 1.5 },
  productRowDisabled: { opacity: 0.5 },
  productAvatar: { width: 46, height: 46, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center' },
  productTextWrap: { flex: 1, minWidth: 0 },
  productNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  productName: { flexShrink: 1, fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  productPrice: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 4, ...NUM },
  productFrom: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },

  soldOutPill: { backgroundColor: theme.colors.dangerLight, paddingHorizontal: 9, paddingVertical: 5, borderRadius: theme.radius.full },
  soldOutText: { fontSize: 11, fontFamily: theme.typography.font.semibold, color: theme.colors.danger },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surface,
  },
  addBtnText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.primary },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary },
  stepperBtn: { width: 34, height: 36, justifyContent: 'center', alignItems: 'center' },
  stepperQty: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.white, minWidth: 16, textAlign: 'center', ...NUM },

  // Cart
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: 10,
    paddingHorizontal: 16,
    ...ui.softShadow,
  },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  summaryQty: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, minWidth: 24, ...NUM },
  summaryLineName: { fontSize: 14, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
  summaryLineSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: 1 },
  summaryStepper: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: theme.colors.background, borderRadius: theme.radius.full, paddingHorizontal: 2, height: 32 },
  summaryStepperBtn: { width: 34, height: 32, justifyContent: 'center', alignItems: 'center' },
  summaryLineTotal: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, minWidth: 56, textAlign: 'right', ...NUM },
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 4 },
  totalsLabel: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, ...NUM },

  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 56,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    marginTop: 10,
    marginBottom: 12,
  },
  cartBadge: { minWidth: 30, height: 30, paddingHorizontal: 8, borderRadius: 10, backgroundColor: theme.colors.accentLight, justifyContent: 'center', alignItems: 'center' },
  cartBadgeText: { color: theme.colors.primary, fontSize: 14, fontFamily: theme.typography.font.bold, ...NUM },
  cartBarText: { flex: 1, color: theme.colors.white, fontSize: 15, fontFamily: theme.typography.font.semibold },
  cartBarTotal: { color: theme.colors.white, fontSize: 17, fontFamily: theme.typography.font.semibold, ...NUM },
});
