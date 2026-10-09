// features/orders/useActiveOrderCount.ts
// ADDED (2026-10-09): Owner/Manager tab bar ke "Orders" tab ka badge — kitne orders abhi chal
// rahe hain (New / Preparing / Ready). Owner ko ek nazar mein pata chale "kuch dhyaan maang raha hai".
//
// Kyun alag hook (useActiveOrders nahi): tab bar ka icon screen nahi hai — wahan useFocusEffect
// nahi chalta, aur poori list state rakhne ki zaroorat nahi. Yeh sirf id → status map rakhta hai:
//  - mount pe ek baar fetch, phir socket events (order:created / order:updated) se live update
//  - reconnect pe dobara fetch (disconnect ke beech miss hue events recover)
//  - cleanup mein SIRF apne listeners hatata hai — shared socket band nahi (Billing/Orders bhi use karte hain)
// Login ke baad admin layout ke saath ek hi baar mount hota hai — har tab switch pe API call nahi.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ordersApi, OrderSummary } from './orders.api';
import { connectSocket } from '../../lib/socket-client';

const ACTIVE = new Set(['PENDING', 'PREPARING', 'READY']);

export function useActiveOrderCount(): number {
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const socketRef = useRef<Socket | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.getOrders();
      const next: Record<string, string> = {};
      for (const o of data) next[o.id] = o.orderStatus;
      setStatusById(next);
    } catch {
      // badge sirf extra info hai — fail ho to purana count rehne do, error screen nahi
    }
  }, []);

  useEffect(() => {
    load();
    let onConnect: () => void;
    let onCreated: (p: { order: OrderSummary }) => void;
    let onUpdated: (p: { order: OrderSummary }) => void;

    connectSocket()
      .then((socket) => {
        socketRef.current = socket;
        onConnect = () => load();
        onCreated = ({ order }) => setStatusById((prev) => ({ ...prev, [order.id]: order.orderStatus }));
        onUpdated = ({ order }) => setStatusById((prev) => ({ ...prev, [order.id]: order.orderStatus }));
        socket.on('connect', onConnect);
        socket.on('order:created', onCreated);
        socket.on('order:updated', onUpdated);
      })
      .catch(() => {});

    return () => {
      const socket = socketRef.current;
      if (!socket) return;
      if (onConnect) socket.off('connect', onConnect);
      if (onCreated) socket.off('order:created', onCreated);
      if (onUpdated) socket.off('order:updated', onUpdated);
    };
  }, [load]);

  return Object.values(statusById).filter((s) => ACTIVE.has(s)).length;
}
