// components/delivery/DeliveryCashCard.tsx
// ADDED (2026-10-18): WHATSAPP DELIVERY LINK — "kis delivery boy ke paas kitna cash hai" (Dashboard)
// USE CASE: Raju ne din bhar 6 orders mein ₹1,450 cash liya. Closing pe Owner/Manager yahan dekhta hai,
// paise leta hai, "Got ₹1,450" dabata hai → list se hat jaata hai + Audit log. Kuch baaki nahi to card
// dikhta hi nahi (clutter nahi). Sirf wahi orders settle hote hain jo screen pe dikhe — beech mein
// naya delivery aaya to woh agli baar ke liye bachta hai (server bhi yahi check karta hai).
// CONNECTED TO: delivery.api.ts (getCash, settleCash), app/(admin)/dashboard.tsx

import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bike } from 'lucide-react-native';
import { deliveryApi, DeliveryCashGroup } from '../../features/delivery/delivery.api';
import { connectSocket } from '../../lib/socket-client';
import { getErrorMessage } from '../../lib/api-client';
import { formatINR } from '../../lib/format';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';

export function DeliveryCashCard() {
  const [groups, setGroups] = useState<DeliveryCashGroup[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    deliveryApi.getCash().then(setGroups).catch(() => {}); // fail → purana hi dikhao (card chhupa rahe)
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Delivery boy ne link pe "Delivered" dabaya → turant naya total
  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | null = null;
    connectSocket()
      .then((socket) => {
        if (cancelled) return;
        const handler = () => load();
        socket.on('order:updated', handler);
        off = () => socket.off('order:updated', handler);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      off?.();
    };
  }, [load]);

  if (groups.length === 0) return null;

  const settle = (g: DeliveryCashGroup) => {
    Alert.alert(`Got ${formatINR(g.cash)} from ${g.name}?`, `Cash from ${g.count} delivery order${g.count === 1 ? '' : 's'}.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Yes, received',
        onPress: async () => {
          setBusyId(g.deliveryPersonId);
          try {
            await deliveryApi.settleCash(g.deliveryPersonId, g.orderIds);
            haptics.success();
          } catch (err) {
            haptics.error();
            Alert.alert('Could not save', getErrorMessage(err));
          } finally {
            setBusyId(null);
            load();
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Bike size={18} color={theme.colors.primary} />
        <Text style={styles.title}>Cash with delivery people</Text>
      </View>
      {groups.map((g) => (
        <View key={g.deliveryPersonId} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{g.name}</Text>
            <Text style={styles.sub}>
              {g.count} order{g.count === 1 ? '' : 's'} · {formatINR(g.cash)} cash
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            onPress={() => settle(g)}
            disabled={busyId !== null}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${formatINR(g.cash)} received from ${g.name}`}
          >
            {busyId === g.deliveryPersonId ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Text style={styles.btnText}>Got {formatINR(g.cash)}</Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    marginBottom: 16, // Dashboard spacing — card na ho to khaali jagah bhi nahi
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  title: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  name: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  sub: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  btn: { height: 40, minWidth: 96, paddingHorizontal: 14, borderRadius: theme.radius.full, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  btnText: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.white, fontVariant: ['tabular-nums'] },
});
