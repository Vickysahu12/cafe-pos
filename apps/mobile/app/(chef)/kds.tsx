// app/(chef)/kds.tsx
//
// UI/UX PASS (2026-09-30) — asli kitchen ke hisaab se:
//  - 🔔 Naye order pe chime + vibration (useNewOrderAlert) + "New order #12" banner
//  - 😴 Screen kabhi sleep nahi hoti jab tak KDS khula hai (useKeepAwake) — pehle
//    tablet lock ho jaata tha aur orders miss hote the
//  - ⏱️ Sabse PURANA order pehle (FIFO) — pehle naya order upar aata tha, purane
//    wale neeche dab jaate the
//  - Doosre chef device ke item-status updates live (order:item_updated listener)
//  - Skeleton loading + pehli load fail pe ErrorState/retry
//  - Logout pe confirm; bekaar "filter" button hataya (kuch karta hi nahi tha)
//  - Delivery chip (count pehle se calculate hota tha, chip missing thi)
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { LogOut, ChefHat, Clock, BellRing } from 'lucide-react-native';
import type { Socket } from 'socket.io-client';
import { ordersApi, KdsOrder, OrderItemResponse } from '../../features/orders/orders.api';
import { useNewOrderAlert } from '../../features/orders/useNewOrderAlert';
import { connectSocket, disconnectSocket } from '../../lib/socket-client';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { useAuthStore } from '../../features/auth/auth.store';
import { KdsOrderCard } from '../../components/chef/KdsOrderCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/StateViews';
import { theme } from '../../theme';

// FIFO: sabse purana (sabse zyada wait kar raha) order pehle
const byOldestFirst = (a: KdsOrder, b: KdsOrder) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'READY'];
type FilterType = 'ALL' | 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';

export default function KdsScreen() {
  useKeepAwake(); // KDS khula hai to screen on
  const playNewOrderAlert = useNewOrderAlert();
  const logout = useAuthStore((s) => s.logout);
  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newOrderBanner, setNewOrderBanner] = useState<string | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNewOrderBanner = useCallback((order: KdsOrder) => {
    const where = order.table ? `Table ${order.table.tableNumber}` : order.orderType === 'DINE_IN' ? 'Dine-in' : order.orderType === 'DELIVERY' ? 'Delivery' : 'Takeaway';
    setNewOrderBanner(`New order #${order.orderNumber} · ${where}${order.cashierId ? '' : ' · QR'}`);
    Animated.spring(bannerAnim, { toValue: 1, useNativeDriver: true }).start();
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => {
      Animated.timing(bannerAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setNewOrderBanner(null));
    }, 5000);
  }, [bannerAnim]);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  // Jo orders already dikh chuke — inpe dobara chime nahi
  const knownOrderIds = useRef(new Set<string>());
  // Socket listener ek hi baar lagta hai; latest alert function ref se (stale closure nahi)
  const alertRef = useRef<(order: KdsOrder) => void>(() => {});
  alertRef.current = (order: KdsOrder) => {
    playNewOrderAlert();
    showNewOrderBanner(order);
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'New orders will not show on this screen until someone logs in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };
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
      const active = data.filter((o) => ACTIVE_STATUSES.includes(o.orderStatus)).sort(byOldestFirst);
      active.forEach((o) => knownOrderIds.current.add(o.id));
      setOrders(active);
      updateTimestamp();
      setLoadError(null);
    } catch (err) {
      // Pehle se orders dikh rahe hon to unhe rehne do (socket se aate rahenge)
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    connectSocket().then((socket) => {
      socketRef.current = socket;

      // FIX (2026-09-29): har (re)connect pe list dobara load — socket jitni der
      // disconnected raha (WiFi blip, server deploy), us beech ke orders ke events
      // miss ho jaate the aur KDS pe kabhi nahi dikhte the
      socket.on('connect', () => {
        setConnected(true);
        loadOrders();
      });
      socket.on('disconnect', () => setConnected(false));
      if (socket.connected) setConnected(true);

      socket.on('order:created', ({ order }: { order: KdsOrder }) => {
        // FIX (2026-09-29): duplicate guard — refetch aur socket event ek saath
        // aayein to same order KDS pe do baar dikhta tha
        setOrders((prev) => (prev.some((o) => o.id === order.id) ? prev : [...prev, order].sort(byOldestFirst)));
        updateTimestamp();
        // FIX (2026-09-30): chime + banner — sirf SACH mein naye order pe (knownIds),
        // reconnect/refetch pe purane orders dobara aane se beep nahi bajna chahiye
        if (!knownOrderIds.current.has(order.id)) {
          knownOrderIds.current.add(order.id);
          alertRef.current(order);
        }
      });

      // FIX (2026-09-30): doosre chef device (ya Owner) ne item status badla to yahan bhi dikhe
      socket.on('order:item_updated', ({ orderId, item }: { orderId: string; item: OrderItemResponse }) => {
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId ? { ...o, items: o.items.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)) } : o
          )
        );
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
    haptics.tap();
    try {
      await ordersApi.updateOrderItemStatus(order.id, itemId, nextStatus);
    } catch (err) {
      // FIX (2026-09-30): pehle chupchaap reload — chef ko pata hi nahi chalta tha ki tap fail hua
      haptics.error();
      Alert.alert('Could not update item', getErrorMessage(err));
      loadOrders();
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleMarkOrderReady = async (order: KdsOrder) => {
    try {
      await ordersApi.updateOrderStatus(order.id, 'READY');
      haptics.success();
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      haptics.error();
      Alert.alert('Could not mark ready', getErrorMessage(err));
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
        <View style={[styles.header, { gap: theme.spacing.md }]}>
          <Skeleton width={40} height={40} radius={theme.radius.md} />
          <View style={{ flex: 1 }}>
            <Skeleton width={150} height={18} />
            <Skeleton width={110} height={11} style={{ marginTop: 6 }} />
          </View>
        </View>
        <View style={[styles.grid, { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }]}>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} width="47%" height={220} radius={theme.radius.lg} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // Pehli load hi fail aur koi order nahi → retry screen (socket se bhi aate rahenge)
  if (loadError && orders.length === 0 && !connected) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ErrorState message={loadError} onRetry={() => { setLoading(true); loadOrders(); }} />
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
          <Pressable style={styles.iconBtn} onPress={confirmLogout} hitSlop={8} accessibilityLabel="Log out">
            <LogOut size={16} color={theme.colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {/* FIX (2026-09-30): naye order ka banner (chime ke saath) — 5 sec dikhta hai */}
      {newOrderBanner && (
        <Animated.View
          style={[
            styles.newOrderBanner,
            {
              opacity: bannerAnim,
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            },
          ]}
        >
          <BellRing size={18} color="#FFFFFF" />
          <Text style={styles.newOrderBannerText}>{newOrderBanner}</Text>
        </Animated.View>
      )}

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

          {counts.DELIVERY > 0 && (
            <Pressable
              style={[styles.filterChip, activeFilter === 'DELIVERY' && styles.filterChipActive]}
              onPress={() => setActiveFilter('DELIVERY')}
            >
              <Text style={[styles.filterChipText, activeFilter === 'DELIVERY' && styles.filterChipTextActive]}>Delivery</Text>
              <View style={[styles.countBadge, activeFilter === 'DELIVERY' && styles.countBadgeActive]}>
                <Text style={[styles.countText, activeFilter === 'DELIVERY' && styles.countTextActive]}>{counts.DELIVERY}</Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
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
  newOrderBanner: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    marginHorizontal: theme.spacing.md, marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.success, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm + 2,
    shadowColor: theme.colors.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  newOrderBannerText: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, flex: 1 },
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