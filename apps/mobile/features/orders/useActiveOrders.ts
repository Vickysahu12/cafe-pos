// features/orders/useActiveOrders.ts
// USE CASE: Shared real-time order state. billing.tsx (a quick "needs attention"
// strip) and orders.tsx (the full filterable list) both need the exact same live
// data — this hook is the single source of truth instead of each screen wiring
// its own socket listeners separately, which would risk them drifting out of sync.
// CONNECTED TO: orders.api.ts, lib/socket-client.ts.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Socket } from 'socket.io-client';
import { ordersApi, OrderSummary } from './orders.api';
import { connectSocket } from '../../lib/socket-client';

export function useActiveOrders() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

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

  useEffect(() => {
    let handleConnect: () => void;
    let handleDisconnect: () => void;
    let handleCreated: (payload: { order: OrderSummary }) => void;
    let handleUpdated: (payload: { order: OrderSummary }) => void;

    connectSocket().then((socket) => {
      socketRef.current = socket;

      handleConnect = () => setConnected(true);
      handleDisconnect = () => setConnected(false);
      handleCreated = ({ order }) => setOrders((prev) => [order, ...prev]);
      handleUpdated = ({ order }) =>
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...order } : o)));

      socket.on('connect', handleConnect);
      socket.on('disconnect', handleDisconnect);
      socket.on('order:created', handleCreated);
      socket.on('order:updated', handleUpdated);
      if (socket.connected) setConnected(true);
    });

    // Only remove OUR OWN listeners on cleanup — not the whole connection.
    // Billing and Orders may both be mounted at once (Tabs keep screens alive
    // in the background), so a full disconnectSocket() here would kill the
    // connection out from under whichever screen is still open.
    return () => {
      const socket = socketRef.current;
      if (!socket) return;
      if (handleConnect) socket.off('connect', handleConnect);
      if (handleDisconnect) socket.off('disconnect', handleDisconnect);
      if (handleCreated) socket.off('order:created', handleCreated);
      if (handleUpdated) socket.off('order:updated', handleUpdated);
    };
  }, []);

  return { orders, loading, connected, refetch: load };
}