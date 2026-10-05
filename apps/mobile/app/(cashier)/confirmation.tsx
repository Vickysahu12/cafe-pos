// app/(cashier)/confirmation.tsx
// USE CASE: Success screen after an order is placed and paid. Simple, celebratory,
//           gets out of the way fast — Cashier needs to get back to billing quickly.
// CONNECTED TO: Reached from checkout.tsx via router params (orderId, orderNumber, netAmount).
//
// ADDED (2026-10-05): "Send bill on WhatsApp" — customer abhi counter pe hai, yahi sabse
// sahi waqt hai digital bill bhejne ka (components/orders/ShareBillSheet.tsx).

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';
import { theme } from '../../theme';
import { SendBillButton, ShareBillSheet } from '../../components/orders/ShareBillSheet';

export default function ConfirmationScreen() {
  const router = useRouter();
  const { orderId, orderNumber, netAmount } = useLocalSearchParams<{ orderId: string; orderNumber: string; netAmount?: string }>();
  const [billOpen, setBillOpen] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.iconBadge}>
          <CheckCircle2 size={56} color={theme.colors.success} />
        </View>
        <Text style={styles.title}>Order Placed!</Text>
        <Text style={styles.orderNumber}>Order #{orderNumber}</Text>
        <Text style={styles.subtitle}>Sent to the kitchen — you'll see it in Active Orders</Text>

        {/* ADDED (2026-10-05): checkout = paid, to bill turant bheja ja sakta hai */}
        {!!orderId && !!netAmount && (
          <View style={styles.fullWidth}>
            <SendBillButton onPress={() => setBillOpen(true)} />
          </View>
        )}

        <Pressable style={styles.newOrderBtn} onPress={() => router.replace('/(cashier)/billing')}>
          <Text style={styles.newOrderText}>New Order</Text>
        </Pressable>
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
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: theme.spacing.xxl },
  iconBadge: { width: 96, height: 96, borderRadius: theme.radius.full, backgroundColor: theme.colors.successLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  orderNumber: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.semibold, color: theme.colors.success, marginBottom: theme.spacing.sm },
  subtitle: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: theme.spacing.xxl },
  fullWidth: { width: '100%' },
  newOrderBtn: { width: '100%', height: 54, borderRadius: theme.radius.md, backgroundColor: theme.colors.primaryDark, justifyContent: 'center', alignItems: 'center' },
  newOrderText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});