// lib/use-screen-load.ts
// USE CASE (2026-09-30): Har list screen ka loading/error/refresh ek jagah.
// Pehle zyaadatar screens `try { load } finally { setLoading(false) }` karti thi —
// catch hi nahi tha. Internet gaya to error chupchaap nigal liya jaata aur screen
// "No staff yet" / "No items yet" dikhati — owner ko lagta data gayab ho gaya!
// Ab: error aaye to ErrorState + Try Again, pull-to-refresh, aur screen focus pe
// silently refetch (purana data dikhta rehta hai, spinner nahi).
//
// Usage:
//   const { loading, refreshing, error, refresh, retry } = useScreenLoad(async () => {
//     setItems(await api.getItems());
//   });
// CONNECTED TO: menu, products, staff, tables, inventory, audit-logs screens.

import { useState, useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { getErrorMessage } from './api-client';

export function useScreenLoad(loadFn: () => Promise<void>) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Latest loadFn ref mein — taaki caller ko useCallback ki zaroorat na pade
  const fnRef = useRef(loadFn);
  fnRef.current = loadFn;

  const run = useCallback(async (mode: 'focus' | 'refresh' | 'retry') => {
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'retry') setLoading(true);
    try {
      await fnRef.current();
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Screen pe wapas aane pe (e.g. create screen se back) silently refetch
  useFocusEffect(
    useCallback(() => {
      run('focus');
    }, [run])
  );

  return {
    /** Pehli baar load ho raha hai — skeleton dikhao */
    loading,
    /** Pull-to-refresh chal raha hai */
    refreshing,
    /** Last load ka error (null = sab theek) */
    error,
    /** RefreshControl ka onRefresh */
    refresh: useCallback(() => run('refresh'), [run]),
    /** ErrorState ka "Try Again" */
    retry: useCallback(() => run('retry'), [run]),
    /** Kuch change karne ke baad (add/delete) chupchaap reload */
    reload: useCallback(() => run('focus'), [run]),
  };
}
