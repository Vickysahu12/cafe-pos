// features/inventory/useLowStockCount.ts
// ADDED (2026-10-09): Stock SOP — Manager ke "Stock" tab pe badge: kitne items low/out hain.
// Layout mount pe ek fetch + har `inventory:changed` signal pe (debounced) refetch. Fail ho to
// purana count (badge sirf extra info hai). enabled=false (Owner, jiska Stock tab nahi) → koi call nahi.
// CONNECTED TO: app/(admin)/_layout.tsx, inventory.api.ts, useStockSignal.ts

import { useCallback, useEffect, useState } from 'react';
import { inventoryApi } from './inventory.api';
import { useStockSignal } from './useStockSignal';

export function useLowStockCount(enabled: boolean): number {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (!enabled) return;
    inventoryApi
      .getLowStockItems()
      .then((items) => setCount(items.length))
      .catch(() => {});
  }, [enabled]);
  useEffect(() => {
    load();
  }, [load]);
  useStockSignal(load, { enabled });
  return enabled ? count : 0;
}
