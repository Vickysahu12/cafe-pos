// features/inventory/useStockSignal.ts
// ADDED (2026-10-09): Stock SOP — backend har stock badlav pe (order ne kaata, cancel, purchase,
// wastage, count, recipe save) POS room ko `inventory:changed` bhejta hai (stock-events.ts).
// Yeh hook us signal pe callback chalata hai — Stock list / item detail / billing badges bina
// pull-to-refresh ke update. Rush mein 10 orders = 10 events → 800ms debounce (ek hi refetch).
//  - Shared socket: sirf APNA listener hatata hai (QrOrderAlert, orders bhi isi socket pe hain)
//  - Reconnect pe bhi ek refetch (beech mein miss hue badlav)
//  - onAlerts: jo items abhi-abhi LOW/OUT hue (StockAlertBanner ke liye)
// CONNECTED TO: lib/socket-client.ts, inventory screens, billing.tsx, components/inventory/StockAlertBanner.tsx

import { useEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket } from '../../lib/socket-client';

export interface StockAlertPayload {
  inventoryItemId: string;
  name: string;
  unit: string;
  quantity: number;
  lowStockAlertAt: number;
  level: 'LOW' | 'OUT';
}

export function useStockSignal(onChange: () => void, opts?: { onAlerts?: (alerts: StockAlertPayload[]) => void; enabled?: boolean }) {
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const alertsRef = useRef(opts?.onAlerts);
  alertsRef.current = opts?.onAlerts;
  const enabled = opts?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    let socket: Socket | null = null;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => changeRef.current(), 800);
    };
    const onChanged = (payload?: { alerts?: StockAlertPayload[] }) => {
      const alerts = Array.isArray(payload?.alerts) ? payload!.alerts : [];
      if (alerts.length > 0) alertsRef.current?.(alerts);
      fire();
    };
    const onConnect = () => fire();

    connectSocket()
      .then((s) => {
        if (cancelled) return;
        socket = s;
        s.on('inventory:changed', onChanged);
        s.on('connect', onConnect);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      socket?.off('inventory:changed', onChanged);
      socket?.off('connect', onConnect);
    };
  }, [enabled]);
}
