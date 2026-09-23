// app/(chef)/kds.tsx
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, ChefHat, SlidersHorizontal, Clock } from 'lucide-react-native';
import type { Socket } from 'socket.io-client';
import { ordersApi, KdsOrder, OrderItemResponse } from '../../features/orders/orders.api';
import { connectSocket, disconnectSocket } from '../../lib/socket-client';
import { useAuthStore } from '../../features/auth/auth.store';
import { KdsOrderCard } from '../../components/chef/KdsOrderCard';
import { theme } from '../../theme';

const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'READY'];
type FilterType = 'ALL' | 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';

export default function KdsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('ALL');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [, forceTick] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  const updateTimestamp = () => {
    const now = new Date();
    setLastUpdated(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  };

  const loadOrders = useCallback(async () => {
    try {
      const data = (await ordersApi.getOrders()) as unknown as KdsOrder[];
      setOrders(data.filter((o) => ACTIVE_STATUSES.includes(o.orderStatus)));
      updateTimestamp();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    connectSocket().then((socket) => {
      socketRef.current = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));

      socket.on('order:created', ({ order }: { order: KdsOrder }) => {
        setOrders((prev) => [order, ...prev]);
        updateTimestamp();
      });

      socket.on('order:updated', ({ order }: { order: KdsOrder }) => {
        setOrders((prev) => {
          if (!ACTIVE_STATUSES.includes(order.orderStatus)) {
            return prev.filter((o) => o.id !== order.id);
          }
          return prev.map((o) => (o.id === order.id ? { ...o, ...order } : o));
        });
        updateTimestamp();
      });
    });

    const tickInterval = setInterval(() => forceTick((t) => t + 1), 30000);

    return () => {
      disconnectSocket();
      clearInterval(tickInterval);
    };
  }, [loadOrders]);

  const handleItemStatusChange = async (order: KdsOrder, itemId: string, nextStatus: OrderItemResponse['status']) => {
    setUpdatingItemId(itemId);
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, status: nextStatus } : i)) } : o
      )
    );
    try {
      await ordersApi.updateOrderItemStatus(order.id, itemId, nextStatus);
    } catch {
      loadOrders();
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleMarkOrderReady = async (order: KdsOrder) => {
    try {
      await ordersApi.updateOrderStatus(order.id, 'READY');
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch {
      loadOrders();
    }
  };

  const getElapsedMinutes = (createdAt: string) => Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);

  const filteredOrders = useMemo(() => {
    if (activeFilter === 'ALL') return orders;
    return orders.filter((o) => o.orderType === activeFilter);
  }, [orders, activeFilter]);

  const counts = useMemo(() => {
    return {
      ALL: orders.length,
      TAKEAWAY: orders.filter((o) => o.orderType === 'TAKEAWAY').length,
      DINE_IN: orders.filter((o) => o.orderType === 'DINE_IN').length,
      DELIVERY: orders.filter((o) => o.orderType === 'DELIVERY').length,
    };
  }, [orders]);

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
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.chefBadge}>
            <ChefHat size={20} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.headerTitle}>Kitchen Display</Text>
            <Text style={styles.headerSubtitle}>Good Food • Happy Customers</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.statusBadge, { backgroundColor: connected ? '#E8F5E9' : theme.colors.dangerLight }]}>
            <View style={[styles.connectionDot, { backgroundColor: connected ? theme.colors.success : theme.colors.danger }]} />
            <Text style={[styles.connectionText, { color: connected ? theme.colors.success : theme.colors.danger }]}>
              {connected ? 'Live' : 'Reconnecting...'}
            </Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={logout} hitSlop={8}>
            <LogOut size={16} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* Filter Chips Bar */}
      <View style={styles.filterBarContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          <Pressable
            style={[styles.filterChip, activeFilter === 'ALL' && styles.filterChipActive]}
            onPress={() => setActiveFilter('ALL')}
          >
            <Text style={[styles.filterChipText, activeFilter === 'ALL' && styles.filterChipTextActive]}>All Orders</Text>
            <View style={[styles.countBadge, activeFilter === 'ALL' && styles.countBadgeActive]}>
              <Text style={[styles.countText, activeFilter === 'ALL' && styles.countTextActive]}>{counts.ALL}</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.filterChip, activeFilter === 'TAKEAWAY' && styles.filterChipActive]}
            onPress={() => setActiveFilter('TAKEAWAY')}
          >
            <Text style={[styles.filterChipText, activeFilter === 'TAKEAWAY' && styles.filterChipTextActive]}>Takeaway</Text>
            <View style={[styles.countBadge, activeFilter === 'TAKEAWAY' && styles.countBadgeActive]}>
              <Text style={[styles.countText, activeFilter === 'TAKEAWAY' && styles.countTextActive]}>{counts.TAKEAWAY}</Text>
            </View>
          </Pressable>

          <Pressable
            style={[styles.filterChip, activeFilter === 'DINE_IN' && styles.filterChipActive]}
            onPress={() => setActiveFilter('DINE_IN')}
          >
            <Text style={[styles.filterChipText, activeFilter === 'DINE_IN' && styles.filterChipTextActive]}>Dine In</Text>
            <View style={[styles.countBadge, activeFilter === 'DINE_IN' && styles.countBadgeActive]}>
              <Text style={[styles.countText, activeFilter === 'DINE_IN' && styles.countTextActive]}>{counts.DINE_IN}</Text>
            </View>
          </Pressable>
        </ScrollView>
        <Pressable style={styles.filterBtn}>
          <SlidersHorizontal size={15} color={theme.colors.textSecondary} />
        </Pressable>
      </View>

      {/* Active Orders Sub-Header */}
      <View style={styles.sectionHeader}>
        <View>
          <View style={styles.sectionTitleRow}>
            <View style={styles.redDot} />
            <Text style={styles.sectionTitle}>Active Orders</Text>
          </View>
          <Text style={styles.sectionSubtext}>
            {filteredOrders.length} {filteredOrders.length === 1 ? 'order needs' : 'orders need'} your attention
          </Text>
        </View>

        {lastUpdated ? (
          <View style={styles.timeMeta}>
            <Clock size={12} color={theme.colors.textMuted} />
            <Text style={styles.timeMetaText}>Last Updated {lastUpdated}</Text>
          </View>
        ) : null}
      </View>

      {/* Main Grid Content */}
      {filteredOrders.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconBadge}>
            <ChefHat size={36} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>Keep cooking!</Text>
          <Text style={styles.emptySubtext}>Orders will appear here in real-time</Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.cardContainer}>
              <KdsOrderCard
                order={item}
                elapsedMinutes={getElapsedMinutes(item.createdAt)}
                onItemStatusChange={(itemId, nextStatus) => handleItemStatusChange(item, itemId, nextStatus)}
                onMarkOrderReady={() => handleMarkOrderReady(item)}
                updatingItemId={updatingItemId}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8FAF9' },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60 },

  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chefBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: theme.colors.primaryDark || '#0A3A2A',
    //justify: 'center',
    alignItems: 'center',
    paddingTop:7
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    gap: 5,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    //justify: 'center',
    alignItems: 'center',
    paddingTop:7
  },

  filterBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    marginVertical: 6,
    gap: 8,
  },
  filterScroll: {
    gap: 8,
    paddingRight: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ECECEC',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryDark || '#0A3A2A',
    borderColor: theme.colors.primaryDark || '#0A3A2A',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  countBadge: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  countText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  countTextActive: {
    color: '#FFFFFF',
  },
  filterBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECECEC',
    //justify: 'center',
    alignItems: 'center',
    paddingTop:8
  },

  sectionHeader: {
    flexDirection: 'row',
    //justify: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  redDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.danger,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  sectionSubtext: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  timeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeMetaText: {
    fontSize: 10,
    color: theme.colors.textMuted,
  },

  grid: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 20,
  },
  columnWrapper: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardContainer: {
    flex: 1,
  },

  emptyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FFFFFF',
    //justify: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    elevation: 1,
    paddingTop:10
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  emptySubtext: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
});