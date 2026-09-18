// app/(cashier)/checkout.tsx
// USE CASE: Final step before an order is actually created on the backend. Cashier
//           picks a payment method; Cash shows a received/change calculator. "Place
//           Order" is the ONE place in the whole Cashier flow that calls POST /orders —
//           everything before this (Billing, Cart) is purely local state.
// CONNECTED TO: cart.store.ts (reads items, clears on success), orders.api.ts
//               (createOrder). Navigates to confirmation.tsx on success.

import { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Wallet, Smartphone, CreditCard, QrCode } from 'lucide-react-native';
import { useCartStore } from '../../features/cart/cart.store';
import { ordersApi, PaymentMethod } from '../../features/orders/orders.api';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

const HEADER_GREEN = '#1E3E2B';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { value: 'CASH', label: 'Cash', icon: Wallet },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'CARD', label: 'Card', icon: CreditCard },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const tableId = useCartStore((s) => s.tableId);
  const orderType = useCartStore((s) => s.orderType);
  const subtotal = useCartStore((s) => s.subtotal());
  const clearCart = useCartStore((s) => s.clearCart);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedTax = Math.round(subtotal * 0.05);
  const estimatedTotal = subtotal + estimatedTax;

  const changeAmount = useMemo(() => {
    const received = parseFloat(cashReceived);
    if (isNaN(received)) return null;
    return received - estimatedTotal;
  }, [cashReceived, estimatedTotal]);

  const canPlaceOrder = paymentMethod !== 'CASH' || (changeAmount !== null && changeAmount >= 0);

  const handlePlaceOrder = async () => {
    setError(null);

    // NOTE: this is intentionally a two-step flow on the backend (create → pay),
    // matching how Orders module was built — create the order first (server
    // recalculates the real price from the DB, never trusts this screen's numbers),
    // then mark it paid with the chosen method.
    setPlacing(true);
    try {
      const order = await ordersApi.createOrder({
        tableId: tableId ?? undefined,
        orderType,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          addonIds: i.addonIds.length > 0 ? i.addonIds : undefined,
          quantity: i.quantity,
          notes: i.notes,
        })),
      });

      await ordersApi.payOrder(order.id, { paymentMethod });

      clearCart();
      router.replace({ pathname: '/(cashier)/confirmation', params: { orderId: order.id, orderNumber: String(order.orderNumber) } });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Order summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardTitle}>{items.length} item{items.length === 1 ? '' : 's'}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{subtotal}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax (5%)</Text>
            <Text style={styles.summaryValue}>₹{estimatedTax}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total to Pay</Text>
            <Text style={styles.totalValue}>₹{estimatedTotal}</Text>
          </View>
        </View>

        {/* Payment method picker */}
        <Text style={styles.sectionLabel}>Payment Method</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => {
            const active = paymentMethod === m.value;
            return (
              <Pressable key={m.value} style={[styles.methodCard, active && styles.methodCardActive]} onPress={() => setPaymentMethod(m.value)}>
                <m.icon size={22} color={active ? theme.colors.success : theme.colors.textSecondary} />
                <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Cash calculator — only for Cash */}
        {paymentMethod === 'CASH' && (
          <View style={styles.cashCard}>
            <Text style={styles.sectionLabel}>Cash Received</Text>
            <TextInput
              style={styles.cashInput}
              placeholder="Enter amount received"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              value={cashReceived}
              onChangeText={setCashReceived}
            />
            {changeAmount !== null && (
              <View style={[styles.changeRow, changeAmount < 0 && styles.changeRowInsufficient]}>
                <Text style={styles.changeLabel}>{changeAmount < 0 ? 'Amount Short' : 'Change to Return'}</Text>
                <Text style={[styles.changeValue, changeAmount < 0 && { color: theme.colors.danger }]}>
                  ₹{Math.abs(changeAmount)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* UPI placeholder — real payment gateway integration is a deferred/post-MVP feature */}
        {paymentMethod === 'UPI' && (
          <View style={styles.upiCard}>
            <QrCode size={64} color={theme.colors.textMuted} />
            <Text style={styles.upiText}>Customer scans to pay ₹{estimatedTotal}</Text>
            <Text style={styles.upiNote}>Confirm payment received before placing the order</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.placeOrderBtn, !canPlaceOrder && styles.placeOrderBtnDisabled]}
          onPress={handlePlaceOrder}
          disabled={!canPlaceOrder || placing}
        >
          {placing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.placeOrderText}>
              {paymentMethod === 'CASH' && changeAmount === null ? 'Enter amount received' : `Place Order · ₹${estimatedTotal}`}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: HEADER_GREEN, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
  backBtn: { width: 38, height: 38, borderRadius: theme.radius.full, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: '#FFFFFF' },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },

  summaryCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg, marginBottom: theme.spacing.xl },
  summaryCardTitle: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 13, color: theme.colors.textSecondary },
  summaryValue: { fontSize: 13, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm },
  totalLabel: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  totalValue: { fontSize: theme.typography.size.xl, fontWeight: theme.typography.weight.bold, color: theme.colors.success },

  sectionLabel: { fontSize: 13, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  methodRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  methodCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: theme.spacing.md, borderRadius: theme.radius.lg, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  methodCardActive: { borderColor: theme.colors.success, backgroundColor: theme.colors.successLight },
  methodLabel: { fontSize: 12, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary },
  methodLabelActive: { color: theme.colors.success, fontWeight: theme.typography.weight.bold },

  cashCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  cashInput: { height: 50, borderWidth: 1.5, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: theme.spacing.md, fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
  changeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: theme.colors.successLight, borderRadius: theme.radius.md, padding: theme.spacing.md },
  changeRowInsufficient: { backgroundColor: theme.colors.dangerLight },
  changeLabel: { fontSize: 13, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary },
  changeValue: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.success },

  upiCard: { alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.xxl, gap: theme.spacing.sm },
  upiText: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  upiNote: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },

  errorBanner: { backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.md },
  errorText: { color: theme.colors.danger, fontSize: 13 },

  footer: { padding: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  placeOrderBtn: { height: 54, borderRadius: theme.radius.md, backgroundColor: HEADER_GREEN, justifyContent: 'center', alignItems: 'center' },
  placeOrderBtnDisabled: { opacity: 0.5 },
  placeOrderText: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});