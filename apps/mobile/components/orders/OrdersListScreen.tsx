// components/orders/OrdersListScreen.tsx
// USE CASE: The full, filterable live orders list — shared by the Cashier's Orders
// tab and the Owner's Orders screen (reached from Dashboard → View All). Both roles
// see the same live data via useActiveOrders(); only the detail route differs, since
// Cashier and Owner live in different route groups with different navigation.
// CONNECTED TO: orders.api.ts, features/orders/useActiveOrders.ts.
//
// UI/UX PASS (2026-09-30): skeleton loading, error + retry (pehle network error pe
// "No orders yet" dikhta tha), pull-to-refresh, "Unpaid" filter (cashier ko jaldi
// dikhe kin orders ka paisa lena baaki hai), "Cancelled" filter, asli error messages.

import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Coffee, ShoppingBag, Truck, Check, ClipboardList } from 'lucide-react-native';
import { ordersApi, OrderSummary, OrderStatus } from '../../features/orders/orders.api';
import { useActiveOrders } from '../../features/orders/useActiveOrders';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { SkeletonList } from '../ui/Skeleton';
import { ErrorState, EmptyState } from '../ui/StateViews';
import { theme } from '../../theme';

const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pending', color: theme.colors.danger, bg: theme.colors.dangerLight },
  PREPARING: { label: 'Preparing', color: theme.colors.warning, bg: theme.colors.warningLight },
  READY: { label: 'Ready', color: theme.colors.success, bg: theme.colors.successLight },
  SERVED: { label: 'Served', color: theme.colors.textMuted, bg: theme.colors.background },
  CANCELLED: { label: 'Cancelled', color: theme.colors.textMuted, bg: theme.colors.background },
};

const TYPE_ICON: Record<OrderSummary['orderType'], React.ComponentType<{ size: number; color: string }>> = {
  DINE_IN: Coffee,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Truck,
};

type FilterKey = 'ALL' | 'UNPAID' | OrderStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'UNPAID', label: 'Unpaid' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

const matchesFilter = (o: OrderSummary, f: FilterKey) =>
  f === 'ALL' ? true : f === 'UNPAID' ? o.paymentStatus === 'UNPAID' && o.orderStatus !== 'CANCELLED' : o.orderStatus === f;

interface OrdersListScreenProps {
  /** Detail route prefix, e.g. '/(cashier)/orders' or '/(admin)/orders' */
  detailBasePath: string;
  /** Cashier's Orders is a bottom tab (nothing to go back to); Owner arrives from Dashboard */
  showBack?: boolean;
  title?: string;
}

export function OrdersListScreen({ detailBasePath, showBack = false, title = 'Active Orders' }: OrdersListScreenProps) {
  const router = useRouter();
  const { orders, loading, connected, error, refreshing, refresh, refetch } = useActiveOrders();
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [servingId, setServingId] = useState<string | null>(null);

  const filteredOrders = useMemo(() => {
    const list = orders.filter((o) => matchesFilter(o, filter));
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, filter]);

  const unpaidCount = useMemo(() => orders.filter((o) => matchesFilter(o, 'UNPAID')).length, [orders]);

  const handleMarkServed = async (order: OrderSummary) => {
    setServingId(order.id);
    try {
      await ordersApi.updateOrderStatus(order.id, 'SERVED');
      haptics.success();
      // No local state mutation needed here — the socket's own order:updated
      // event (emitted by the backend right after this call succeeds) will
      // update useActiveOrders' shared state for us.
    } catch (err) {
      haptics.error();
      Alert.alert('Could not update order', getErrorMessage(err));
    } finally {
      setServingId(null);
    }
  };

  const timeAgo = (dateStr: string) => {
    const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        {showBack ? (
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
            <ArrowLeft size={20} color={theme.colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={[styles.statusBadge, { backgroundColor: connected ? '#E8F5E9' : theme.colors.dangerLight }]}>
          <View style={[styles.connectionDot, { backgroundColor: connected ? theme.colors.success : theme.colors.danger }]} />
          <Text style={[styles.connectionText, { color: connected ? theme.colors.success : theme.colors.danger }]}>
            {connected ? 'Live' : 'Reconnecting'}
          </Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        <FlatList
          data={FILTERS}
          keyExtractor={(f) => f.key}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, gap: theme.spacing.sm }}
          renderItem={({ item }) => (
            <Pressable style={[styles.filterChip, filter === item.key && styles.filterChipActive]} onPress={() => setFilter(item.key)}>
              <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>
                {item.label}{item.key === 'UNPAID' && unpaidCount > 0 ? ` (${unpaidCount})` : ''}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {loading ? (
        <SkeletonList count={6} avatar={false} />
      ) : error && orders.length === 0 ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.listContent, filteredOrders.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={ClipboardList}
              title={filter === 'ALL' ? 'No orders yet' : `No ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} orders`}
              message={filter === 'ALL' ? 'New orders from billing and QR show up here instantly.' : undefined}
            />
          }
          renderItem={({ item }) => {
            const meta = STATUS_META[item.orderStatus];
            const TypeIcon = TYPE_ICON[item.orderType];
            const canServe = item.orderStatus === 'READY';

            return (
              <Pressable style={styles.orderCard} onPress={() => router.push(`${detailBasePath}/${item.id}`)}>
                <View style={styles.orderIconBox}>
                  <TypeIcon size={18} color={theme.colors.textSecondary} />
                </View>
                <View style={styles.orderTextWrap}>
                  <View style={styles.orderTopRow}>
                    <View style={styles.orderNumberRow}>
                      <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
                      {/* No cashier attached = the customer placed it themselves via QR */}
                      {!item.cashierId && (
                        <View style={styles.qrBadge}>
                          <Text style={styles.qrBadgeText}>QR</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderMeta}>
                    {item.table ? `Table ${item.table.tableNumber}` : item.orderType.replace('_', ' ')} · {timeAgo(item.createdAt)}
                  </Text>
                  <View style={styles.orderBottomRow}>
                    <Text style={styles.orderAmount}>₹{Number(item.netAmount.toFixed(2))}</Text>
                    <Text
                      style={[
                        styles.paymentText,
                        item.paymentStatus === 'PAID' && { color: theme.colors.success },
                        item.paymentStatus === 'UNPAID' && { color: theme.colors.danger, fontWeight: '700' },
                      ]}
                    >
                      {item.paymentStatus}
                    </Text>
                  </View>
                </View>

                {canServe && (
                  <Pressable
                    style={styles.serveButton}
                    onPress={() => handleMarkServed(item)}
                    disabled={servingId === item.id}
                  >
                    {servingId === item.id ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Check size={14} color="#FFFFFF" />
                        <Text style={styles.serveButtonText}>Serve</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.surface },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },

  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    gap: 5,
  },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { fontSize: 11, fontWeight: '600' },

  filterRow: { paddingVertical: theme.spacing.md, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  filterChip: { paddingHorizontal: theme.spacing.md, height: 36, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: theme.typography.weight.semibold },

  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted },

  listContent: { padding: theme.spacing.lg, gap: theme.spacing.md, backgroundColor: theme.colors.background },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  orderIconBox: { width: 40, height: 40, borderRadius: theme.radius.md, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  orderTextWrap: { flex: 1 },
  orderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qrBadge: { backgroundColor: theme.colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.radius.full },
  qrBadgeText: { fontSize: 9, fontWeight: '700', color: theme.colors.primary },
  orderNumber: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full },
  statusPillText: { fontSize: 10, fontWeight: theme.typography.weight.semibold },
  orderMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  orderBottomRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: 4 },
  orderAmount: { fontSize: 13, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  paymentText: { fontSize: 11, color: theme.colors.textMuted, fontWeight: theme.typography.weight.medium },

  serveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.spacing.md,
    height: 34,
    borderRadius: theme.radius.full,
    marginLeft: theme.spacing.sm,
  },
  serveButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: theme.typography.weight.bold },
});