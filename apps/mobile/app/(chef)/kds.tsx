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
//
// UI REDESIGN (2026-10-08) — KITCHEN DARK MODE:
//  - Dark espresso screen (theme/brand.ts `kds`) + light status bar — garam/roshni wali
//    kitchen mein aankhon pe halka, din bhar khula rehta hai
//  - Columns screen ke hisaab se: phone = 1 (text bada rahe), bada phone/tablet = 2, tablet = 3
//  - Header: "Kitchen" + Live chip + logout; filler subtitle ("Good Food • Happy Customers") hataya
//  - Icons ab sahi centre (pehle `justifyContent` comment-out tha, paddingTop hack se adjust)
//  - Filter chips 40px, count ke saath; empty state "All caught up"
//  - New order banner: roast-gold, bada text
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ScrollView, Alert, Animated, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
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
import { kds, font } from '../../theme/brand';

// FIFO: sabse purana (sabse zyada wait kar raha) order pehle
const byOldestFirst = (a: KdsOrder, b: KdsOrder) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'READY'];
type FilterType = 'ALL' | 'TAKEAWAY' | 'DINE_IN' | 'DELIVERY';

export default function KdsScreen() {
  useKeepAwake(); // KDS khula hai to screen on
  // UI REDESIGN (2026-10-08): screen width ke hisaab se columns (phone pe 1 → bada text)
  const { width } = useWindowDimensions();
  const columns = width >= 900 ? 3 : width >= 600 ? 2 : 1;
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
    // ADDED (2026-10-06): naam bhi — "New order #23 · Rahul · Takeaway · QR"
    const who = order.customerName ? ` · ${order.customerName}` : '';
    setNewOrderBanner(`New order #${order.orderNumber}${who} · ${where}${order.cashierId ? '' : ' · QR'}`);
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
        <StatusBar style="light" />
        <View style={styles.header}>
          <Skeleton width={150} height={24} style={styles.skeletonDark} />
          <Skeleton width={90} height={32} radius={16} style={styles.skeletonDark} />
        </View>
        <View style={[styles.grid, { gap: 12 }]}>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} height={200} radius={16} style={styles.skeletonDark} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // Pehli load hi fail aur koi order nahi → retry screen (socket se bhi aate rahenge)
  if (loadError && orders.length === 0 && !connected) {
    return (
      // Error state light theme components use karta hai — isliye yahan light background
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]}>
        <StatusBar style="dark" />
        <ErrorState message={loadError} onRetry={() => { setLoading(true); loadOrders(); }} />
      </SafeAreaView>
    );
  }

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'DINE_IN', label: 'Dine-in' },
    { key: 'TAKEAWAY', label: 'Takeaway' },
    ...(counts.DELIVERY > 0 ? [{ key: 'DELIVERY' as FilterType, label: 'Delivery' }] : []),
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <ChefHat size={24} color={kds.accent} />
          <Text style={styles.headerTitle}>Kitchen</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.liveChip, { backgroundColor: connected ? kds.greenBg : kds.redBg }]}>
            <View style={[styles.liveDot, { backgroundColor: connected ? kds.green : kds.red }]} />
            <Text style={[styles.liveText, { color: connected ? kds.green : kds.red }]}>{connected ? 'Live' : 'Reconnecting…'}</Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={confirmLogout} hitSlop={4} accessibilityLabel="Log out">
            <LogOut size={18} color={kds.muted} />
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
              transform: [{ translateY: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) }],
            },
          ]}
          accessibilityLiveRegion="assertive"
        >
          <BellRing size={20} color={kds.bg} />
          <Text style={styles.newOrderBannerText} numberOfLines={2}>{newOrderBanner}</Text>
        </Animated.View>
      )}

      {/* ── Filters ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll} style={styles.filterBar}>
        {FILTERS.map((f) => {
          const active = activeFilter === f.key;
          return (
            <Pressable
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setActiveFilter(f.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{f.label}</Text>
              <Text style={[styles.filterCount, active && styles.filterChipTextActive]}>{counts[f.key]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {filteredOrders.length} active · oldest first
        </Text>
        {lastUpdated ? (
          <View style={styles.timeMeta}>
            <Clock size={13} color={kds.faint} />
            <Text style={styles.timeMetaText}>Updated {lastUpdated}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Orders ── */}
      {filteredOrders.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconBadge}>
            <ChefHat size={34} color={kds.accent} />
          </View>
          <Text style={styles.emptyText}>All caught up</Text>
          <Text style={styles.emptySubtext}>New orders appear here instantly, with a chime.</Text>
        </View>
      ) : (
        <FlatList
          key={`cols-${columns}`}
          data={filteredOrders}
          keyExtractor={(o) => o.id}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={[styles.grid, columns === 1 && { gap: 12 }]}
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
  safeArea: { flex: 1, backgroundColor: kds.bg },
  skeletonDark: { backgroundColor: kds.surfaceRaised },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 22, fontFamily: font.bold, color: kds.text },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  liveChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontSize: 13, fontFamily: font.semibold },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: kds.surface, borderWidth: 1, borderColor: kds.line, justifyContent: 'center', alignItems: 'center' },

  newOrderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: kds.accent,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  newOrderBannerText: { color: kds.bg, fontSize: 16, fontFamily: font.bold, flex: 1 },

  filterBar: { flexGrow: 0 },
  filterScroll: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: kds.surface,
    borderWidth: 1,
    borderColor: kds.line,
  },
  filterChipActive: { backgroundColor: kds.text, borderColor: kds.text },
  filterChipText: { fontSize: 14, fontFamily: font.semibold, color: kds.muted },
  filterChipTextActive: { color: kds.bg },
  filterCount: { fontSize: 14, fontFamily: font.bold, color: kds.faint, fontVariant: ['tabular-nums'] },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontFamily: font.medium, color: kds.muted },
  timeMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  timeMetaText: { fontSize: 12, fontFamily: font.regular, color: kds.faint },

  grid: { paddingHorizontal: 16, paddingBottom: 24 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  cardContainer: { flex: 1 },

  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 60, paddingHorizontal: 32 },
  emptyIconBadge: { width: 72, height: 72, borderRadius: 24, backgroundColor: kds.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyText: { fontSize: 20, fontFamily: font.bold, color: kds.text },
  emptySubtext: { fontSize: 14, fontFamily: font.regular, color: kds.muted, marginTop: 6, textAlign: 'center' },
});
