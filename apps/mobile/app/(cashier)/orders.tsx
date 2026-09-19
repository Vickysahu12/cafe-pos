// app/(cashier)/orders.tsx
// USE CASE: Cashier's view of today's orders — filterable by status. This is where
//           "Mark as Served" happens once the Chef has marked an order Ready. Dashboard's
//           "View All" link already points here.
// CONNECTED TO: orders.api.ts. Reached from Dashboard and Billing screen.

import { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Coffee, ShoppingBag, Truck, Check } from 'lucide-react-native';
import { ordersApi, OrderSummary, OrderStatus } from '../../features/orders/orders.api';
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

const FILTERS: { key: 'ALL' | OrderStatus; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'PREPARING', label: 'Preparing' },
  { key: 'READY', label: 'Ready' },
  { key: 'SERVED', label: 'Served' },
];

export default function ActiveOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | OrderStatus>('ALL');
  const [servingId, setServingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.getOrders();
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filteredOrders = useMemo(() => {
    const list = filter === 'ALL' ? orders : orders.filter((o) => o.orderStatus === filter);
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, filter]);

  const handleMarkServed = async (order: OrderSummary) => {
    setServingId(order.id);
    try {
      await ordersApi.updateOrderStatus(order.id, 'SERVED');
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, orderStatus: 'SERVED' } : o)));
    } catch {
      Alert.alert('Something went wrong', 'Could not update the order. Please try again.');
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
      {/* Centered Clean Professional Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Active Orders</Text>
        <View style={styles.headerRightSpacer} />
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
              <Text style={[styles.filterChipText, filter === item.key && styles.filterChipTextActive]}>{item.label}</Text>
            </Pressable>
          )}
        />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>No orders {filter !== 'ALL' ? `in "${STATUS_META[filter as OrderStatus]?.label}"` : 'yet today'}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.orderStatus];
            const TypeIcon = TYPE_ICON[item.orderType];
            const canServe = item.orderStatus === 'READY';

            return (
              <View style={styles.orderCard}>
                <View style={styles.orderIconBox}>
                  <TypeIcon size={18} color={theme.colors.textSecondary} />
                </View>
                <View style={styles.orderTextWrap}>
                  <View style={styles.orderTopRow}>
                    <Text style={styles.orderNumber}>#{item.orderNumber}</Text>
                    <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.statusPillText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderMeta}>
                    {item.table ? `Table ${item.table.tableNumber}` : item.orderType.replace('_', ' ')} · {timeAgo(item.createdAt)}
                  </Text>
                  <View style={styles.orderBottomRow}>
                    <Text style={styles.orderAmount}>₹{item.netAmount}</Text>
                    <Text style={[styles.paymentText, item.paymentStatus === 'PAID' && { color: theme.colors.success }]}>
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
              </View>
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
    borderRadius: theme.radius.full,
    marginTop:20
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 40,
  },

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