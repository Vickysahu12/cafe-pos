// app/(cashier)/confirmation.tsx
// USE CASE: Success screen after an order is placed and paid. Simple, celebratory,
//           gets out of the way fast — Cashier needs to get back to billing quickly.
// CONNECTED TO: Reached from checkout.tsx via router params (orderId, orderNumber, netAmount).
//
// ADDED (2026-10-05): "Send bill on WhatsApp" — customer abhi counter pe hai, yahi sabse
// sahi waqt hai digital bill bhejne ka (components/orders/ShareBillSheet.tsx).
//
// UI REDESIGN (2026-10-08) — "payment ho gaya" ka pal (Phase 3):
//  - Hara ✓ halka sa pop-in (scale 0.9→1 + fade, 240ms ease-out, native driver). Har order pe
//    dikhta hai isliye chhota aur tez — koi confetti/lamba animation nahi (reduce-motion pe sirf fade)
//  - Bada "₹420 received" (tabular), "Order #23 sent to the kitchen"
//  - WhatsApp bill (hara) → "New order" (espresso, primary) — wahi 2 kaam jo cashier ab karega

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Check, ChefHat } from 'lucide-react-native';
import { theme } from '../../theme';
import { formatINR } from '../../lib/format';
import { Button } from '../../components/ui/Button';
import { useReduceMotion } from '../../components/ui/PressScale';
import { SendBillButton, ShareBillSheet } from '../../components/orders/ShareBillSheet';

export default function ConfirmationScreen() {
  const router = useRouter();
  const { orderId, orderNumber, netAmount } = useLocalSearchParams<{ orderId: string; orderNumber: string; netAmount?: string }>();
  const [billOpen, setBillOpen] = useState(false);
  const reduced = useReduceMotion();

  // ✓ pop-in — ek baar, screen khulte hi
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(pop, { toValue: 1, duration: 240, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start();
  }, [pop]);
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 1 : 0.9, 1] });

  const amount = netAmount ? formatINR(Number(netAmount)) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Animated.View style={[styles.iconBadge, { opacity: pop, transform: [{ scale }] }]}>
          <View style={styles.iconInner}>
            <Check size={40} color={theme.colors.white} strokeWidth={3} />
          </View>
        </Animated.View>

        {amount ? (
          <>
            <Text style={styles.amount}>{amount}</Text>
            <Text style={styles.title}>Payment received</Text>
          </>
        ) : (
          <Text style={styles.title}>Order placed</Text>
        )}

        <View style={styles.kitchenRow}>
          <ChefHat size={16} color={theme.colors.textSecondary} />
          <Text style={styles.subtitle}>Order #{orderNumber} sent to the kitchen</Text>
        </View>
      </View>

      <View style={styles.actions}>
        {/* ADDED (2026-10-05): checkout = paid, to bill turant bheja ja sakta hai */}
        {!!orderId && !!netAmount && <SendBillButton onPress={() => setBillOpen(true)} />}
        <Button title="New order" onPress={() => router.replace('/(cashier)/billing')} />
      </View>

      {!!orderId && !!netAmount && (
        <ShareBillSheet
          visible={billOpen}
          onClose={() => setBillOpen(false)}
          orderId={orderId}
          orderNumber={orderNumber}
          netAmount={netAmount}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xl },
  iconBadge: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: theme.colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  iconInner: { width: 72, height: 72, borderRadius: 36, backgroundColor: theme.colors.success, justifyContent: 'center', alignItems: 'center' },
  amount: { fontSize: 40, lineHeight: 48, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  title: { fontSize: 20, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 2 },
  kitchenRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.md },
  subtitle: { fontSize: 14, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  actions: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.lg },
});
