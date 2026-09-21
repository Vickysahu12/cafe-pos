// app/(chef)/kds.tsx
// USE CASE: Chef's only screen — live-updating order board. New orders arrive instantly
//           via Socket.io (no polling needed), matching the tested real-time flow from
//           the backend. Cards age visually (yellow 8min, red 15min).
// CONNECTED TO: orders.api.ts, lib/socket.ts, auth.store.ts (outletId for the socket room,
//               handled server-side automatically based on JWT role).

import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogOut, ChefHat } from 'lucide-react-native';
import type { Socket } from 'socket.io-client';
import { ordersApi, KdsOrder, OrderItemResponse } from '../../features/orders/orders.api';
import { connectSocket, disconnectSocket } from '../../lib/socket-client';
import { useAuthStore } from '../../features/auth/auth.store';
import { KdsOrderCard } from '../../components/chef/KdsOrderCard';
import { theme } from '../../theme';

const HEADER_GREEN = '#1E3E2B';
const ACTIVE_STATUSES = ['PENDING', 'PREPARING', 'READY'];

export default function KdsScreen() {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);

  const [orders, setOrders] = useState<KdsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [, forceTick] = useState(0); // re-render every 30s so card ages update live
  const socketRef = useRef<Socket | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = (await ordersApi.getOrders()) as unknown as KdsOrder[];
      setOrders(data.filter((o) => ACTIVE_STATUSES.includes(o.orderStatus)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();

    // Real-time connection — new orders appear the instant a Cashier places one
    connectSocket().then((socket) => {
      socketRef.current = socket;

      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));

      socket.on('order:created', ({ order }: { order: KdsOrder }) => {
        setOrders((prev) => [order, ...prev]);
      });

      socket.on('order:updated', ({ order }: { order: KdsOrder }) => {
        setOrders((prev) => {
          // Voided/served orders drop off the active board; everything else updates in place
          if (!ACTIVE_STATUSES.includes(order.orderStatus)) {
            return prev.filter((o) => o.id !== order.id);
          }
          return prev.map((o) => (o.id === order.id ? { ...o, ...order } : o));
        });
      });
    });

    // Tick every 30s purely to re-render elapsed-time badges — no data refetch
    const tickInterval = setInterval(() => forceTick((t) => t + 1), 30000);

    return () => {
      disconnectSocket();
      clearInterval(tickInterval);
    };
  }, [loadOrders]);

  const handleItemStatusChange = async (order: KdsOrder, itemId: string, nextStatus: OrderItemResponse['status']) => {
    setUpdatingItemId(itemId);
    // Optimistic update — KDS needs to feel instant, this is a low-risk local-only change
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id ? { ...o, items: o.items.map((i) => (i.id === itemId ? { ...i, status: nextStatus } : i)) } : o
      )
    );
    try {
      await ordersApi.updateOrderItemStatus(order.id, itemId, nextStatus);
    } catch {
      loadOrders(); // if it failed, resync with the server's real state
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleMarkOrderReady = async (order: KdsOrder) => {
    try {
      await ordersApi.updateOrderStatus(order.id, 'READY');
      setOrders((prev) => prev.filter((o) => o.id !== order.id)); // moves to Cashier's "ready to serve"
    } catch {
      loadOrders();
    }
  };

  const getElapsedMinutes = (createdAt: string) => Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={HEADER_GREEN} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kitchen Display</Text>
          <View style={styles.connectionRow}>
            <View style={[styles.connectionDot, { backgroundColor: connected ? theme.colors.success : theme.colors.danger }]} />
            <Text style={styles.connectionText}>{connected ? 'Live' : 'Reconnecting...'}</Text>
          </View>
        </View>
        <Pressable style={styles.logoutBtn} onPress={logout} hitSlop={8}>
          <LogOut size={17} color="#FFFFFF" />
        </Pressable>
      </View>

      {orders.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconBadge}>
            <ChefHat size={28} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>No active orders</Text>
          <Text style={styles.emptySubtext}>New orders will appear here instantly</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          numColumns={2}
          columnWrapperStyle={{ gap: theme.spacing.md }}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
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
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: HEADER_GREEN, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  headerTitle: { fontSize: 20, fontWeight: theme.typography.weight.bold, color: '#FFFFFF' },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { fontSize: 11, color: '#A7F3D0' },
  logoutBtn: { width: 36, height: 36, borderRadius: theme.radius.full, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },

  grid: { padding: theme.spacing.md, gap: theme.spacing.md },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.md },
  emptyText: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  emptySubtext: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
});