// components/orders/OnlineOrdersSwitch.tsx
// ADDED (2026-10-17): ONLINE ORDERS ON / PAUSED
// USE CASE: QR + website orders thodi der ke liye band — rush, gas khatam, akela banda delivery pe gaya,
// ya raat ko band. Owner/Manager (Dashboard) aur Cashier (Orders tab) dono ke paas. Counter billing pe
// koi asar nahi. Pause 30 min / 1 ghanta / 2 ghante (apne aap khul jaata hai — subah bhoolne ka darr
// nahi) ya "jab tak main wapas na kholu".
// Edge cases:
//  - Time poora hote hi yeh card khud "On" ho jaata hai (local timer + server bhi wahi maanta hai)
//  - Doosre phone ne badla → socket `outlet:ordering` se turant update
//  - Load fail (offline) → card chhupa rehta hai (galat status dikhane se behtar)
// CONNECTED TO: outlet.store.ts, organization.api.ts (setOnlineOrders), backend organization routes

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useOutletStore } from '../../features/organization/outlet.store';
import { organizationApi } from '../../features/organization/organization.api';
import { connectSocket } from '../../lib/socket-client';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { BottomSheet } from '../ui/BottomSheet';
import { theme } from '../../theme';

const PAUSE_OPTIONS: { label: string; minutes?: 30 | 60 | 120 }[] = [
  { label: '30 minutes', minutes: 30 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: 'Until I turn them back on' },
];

/** "4:30 PM" — Hermes ke Intl pe bharosa kiye bina */
function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 === 0 ? 12 : h % 12}:${m < 10 ? '0' : ''}${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function OnlineOrdersSwitch() {
  const ordering = useOutletStore((s) => s.ordering);
  const load = useOutletStore((s) => s.load);
  const setOrdering = useOutletStore((s) => s.setOrdering);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Har baar screen pe aate hi taaza status (doosre phone ne badla ho)
  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load])
  );

  // Doosre phone ne badla → turant
  useEffect(() => {
    let socketRef: Awaited<ReturnType<typeof connectSocket>> | null = null;
    let cancelled = false;
    const handler = (payload: { ordering: { open: boolean; pausedUntil: string | null } }) => setOrdering(payload.ordering);
    connectSocket()
      .then((socket) => {
        if (cancelled) return;
        socketRef = socket;
        socket.on('outlet:ordering', handler);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      socketRef?.off('outlet:ordering', handler);
    };
  }, [setOrdering]);

  // Pause ka time poora → khud "On" (server bhi isi time ke baad orders leta hai)
  useEffect(() => {
    if (!ordering || ordering.open || !ordering.pausedUntil) return;
    const ms = new Date(ordering.pausedUntil).getTime() - Date.now();
    const t = setTimeout(() => setOrdering({ open: true, pausedUntil: null }), Math.max(ms, 0) + 1000);
    return () => clearTimeout(t);
  }, [ordering, setOrdering]);

  if (!ordering) return null;

  const apply = async (paused: boolean, minutes?: 30 | 60 | 120) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await organizationApi.setOnlineOrders(paused, minutes);
      setOrdering(next);
      setSheetOpen(false);
      haptics.success();
    } catch (err) {
      haptics.error();
      Alert.alert('Could not update', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const open = ordering.open;
  const subtitle = open
    ? 'QR and website orders are coming in'
    : ordering.pausedUntil
      ? `Paused · back on at ${formatTime(ordering.pausedUntil)}`
      : 'Paused until you turn them back on';

  return (
    <>
      <View style={[styles.card, !open && styles.cardPaused]}>
        <View style={[styles.dot, { backgroundColor: open ? theme.colors.success : theme.colors.warning }]} />
        <View style={styles.textWrap}>
          <Text style={styles.title}>{open ? 'Online orders on' : 'Online orders paused'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.btn, open ? styles.btnGhost : styles.btnSolid, pressed && { opacity: 0.8 }]}
          onPress={() => (open ? setSheetOpen(true) : apply(false))}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Pause online orders' : 'Turn online orders back on'}
        >
          {busy && !sheetOpen ? (
            <ActivityIndicator size="small" color={open ? theme.colors.textPrimary : theme.colors.white} />
          ) : (
            <Text style={[styles.btnText, !open && { color: theme.colors.white }]}>{open ? 'Pause' : 'Turn on'}</Text>
          )}
        </Pressable>
      </View>

      <BottomSheet visible={sheetOpen} onClose={() => !busy && setSheetOpen(false)} title="Pause online orders">
        <Text style={styles.sheetNote}>
          Customers can still see your menu, but can't order from the QR or website. Counter billing keeps working.
        </Text>
        {PAUSE_OPTIONS.map((o) => (
          <Pressable
            key={o.label}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: theme.colors.background }]}
            onPress={() => apply(true, o.minutes)}
            disabled={busy}
          >
            <Text style={styles.optionText}>{o.label}</Text>
          </Pressable>
        ))}
        {busy && <ActivityIndicator style={{ marginTop: theme.spacing.md }} color={theme.colors.primary} />}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
  },
  cardPaused: { backgroundColor: theme.colors.warningLight, borderColor: theme.colors.warning },
  dot: { width: 10, height: 10, borderRadius: 5 },
  textWrap: { flex: 1 },
  title: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  subtitle: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  btn: { height: 40, minWidth: 84, paddingHorizontal: 16, borderRadius: theme.radius.full, justifyContent: 'center', alignItems: 'center' },
  btnGhost: { borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface },
  btnSolid: { backgroundColor: theme.colors.primary },
  btnText: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  sheetNote: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
  option: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
  },
  optionText: { fontSize: 15, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
});
