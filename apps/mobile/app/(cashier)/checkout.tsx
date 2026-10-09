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
import { ArrowLeft, Wallet, Smartphone, CreditCard } from 'lucide-react-native';
import { useCartStore } from '../../features/cart/cart.store';
import { ordersApi, PaymentMethod } from '../../features/orders/orders.api';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';
import { useFlowBase } from '../../lib/use-flow-base'; // ADDED (2026-10-09): cashier + owner dono groups
import { ui } from '../../theme/ui';

import { formatINR } from '../../lib/format'; // UI REDESIGN (2026-10-08): ₹1,250 format, float ka kachra nahi
const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { value: 'CASH', label: 'Cash', icon: Wallet },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'CARD', label: 'Card', icon: CreditCard },
];

/** ADDED (2026-10-08): Exact + agle round notes (₹100/₹500/₹2000) — cashier ek tap mein chun le */
function quickCashAmounts(total: number): number[] {
  const exact = Math.ceil(total);
  const opts = [exact];
  for (const step of [50, 100, 500, 2000]) {
    const v = Math.ceil(total / step) * step;
    if (v > exact && !opts.includes(v)) opts.push(v);
    if (opts.length === 4) break;
  }
  return opts;
}

export default function CheckoutScreen() {
  const router = useRouter();
  const base = useFlowBase(); // ADDED (2026-10-09): '/(admin)' ya '/(cashier)'
  const items = useCartStore((s) => s.items);
  const tableId = useCartStore((s) => s.tableId);
  const orderType = useCartStore((s) => s.orderType);
  const subtotal = useCartStore((s) => s.subtotal());
  const clearCart = useCartStore((s) => s.clearCart);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // FIX (2026-09-30): pehle flat 5% estimate tha — ab har product ka asli GST (backend jaisa hi hisaab)
  const estimatedTax = useCartStore((s) => s.taxTotal());
  const estimatedTotal = useCartStore((s) => s.grandTotal());

  const changeAmount = useMemo(() => {
    const received = parseFloat(cashReceived);
    if (isNaN(received)) return null;
    return received - estimatedTotal;
  }, [cashReceived, estimatedTotal]);

  const canPlaceOrder = paymentMethod !== 'CASH' || (changeAmount !== null && changeAmount >= 0);

  // FIX (2026-09-30): DUPLICATE ORDER BUG. Order place = 2 API calls (create, phir pay).
  // Pehle agar create ho jaata aur pay fail hota (WiFi blip), to error dikhta aur cart
  // bhara rehta — cashier dobara "Place Order" dabata aur DOOSRA order ban jaata
  // (kitchen mein 2 ticket, sales report galat). Ab:
  //   - create fail → kuch nahi bana, cart safe, dobara try karo (pehle jaisa)
  //   - create OK, pay fail → cart turant clear, order kitchen mein ja chuka hai,
  //     cashier ko seedha us order ki screen pe bhejte hain jahan se "Collect payment" ho
  const handlePlaceOrder = async () => {
    setError(null);

    setPlacing(true);
    let order: Awaited<ReturnType<typeof ordersApi.createOrder>>;
    try {
      order = await ordersApi.createOrder({
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
    } catch (err) {
      haptics.error();
      setError(getErrorMessage(err));
      setPlacing(false);
      return;
    }

    // Order ban gaya — ab cart kabhi dobara submit nahi hona chahiye
    clearCart();

    try {
      // payment ka response = final amount (discount kabhi pay pe lage to bhi sahi bill amount)
      const paid = await ordersApi.payOrder(order.id, { paymentMethod });
      haptics.success();
      // ADDED (2026-10-05): netAmount bhi — confirmation pe "Send bill on WhatsApp" ke message ke liye
      router.replace({
        pathname: `${base}/confirmation`,
        params: { orderId: order.id, orderNumber: String(order.orderNumber), netAmount: String(paid.netAmount) },
      });
    } catch (err) {
      haptics.error();
      Alert.alert(
        `Order #${order.orderNumber} placed — payment not saved`,
        `The order was sent to the kitchen, but the payment couldn't be recorded (${getErrorMessage(err)}). Collect it from the order screen — don't create the order again.`,
        [{ text: 'Open Order', onPress: () => router.replace(`${base}/orders/${order.id}`) }],
        { cancelable: false }
      );
    } finally {
      setPlacing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Order summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryCardTitle}>{items.length} item{items.length === 1 ? '' : 's'}</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatINR(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>GST</Text>
            <Text style={styles.summaryValue}>{formatINR(estimatedTax)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>To pay</Text>
            <Text style={styles.totalValue}>{formatINR(estimatedTotal)}</Text>
          </View>
        </View>

        {/* Payment method picker */}
        <Text style={styles.sectionLabel}>Payment method</Text>
        <View style={styles.methodRow}>
          {PAYMENT_METHODS.map((m) => {
            const active = paymentMethod === m.value;
            return (
              <Pressable key={m.value} style={[styles.methodCard, active && styles.methodCardActive]} onPress={() => setPaymentMethod(m.value)}>
                <m.icon size={22} color={active ? theme.colors.primary : theme.colors.textSecondary} />
                <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Cash calculator — only for Cash */}
        {paymentMethod === 'CASH' && (
          <View style={styles.cashCard}>
            <Text style={styles.sectionLabel}>Cash received</Text>
            {/* UI REDESIGN (2026-10-08): one-tap amounts — har baar "500" type nahi karna */}
            <View style={styles.quickCashRow}>
              {quickCashAmounts(estimatedTotal).map((amt, i) => {
                const active = cashReceived !== '' && Number(cashReceived) === amt;
                return (
                  <Pressable
                    key={amt}
                    style={({ pressed }) => [styles.quickCash, active && styles.quickCashActive, pressed && { transform: [{ scale: 0.96 }] }]}
                    onPress={() => setCashReceived(String(amt))}
                    accessibilityLabel={i === 0 ? `Exact amount ${formatINR(amt)}` : `${formatINR(amt)} received`}
                  >
                    <Text style={[styles.quickCashText, active && styles.quickCashTextActive]}>
                      {i === 0 ? 'Exact' : formatINR(amt)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              style={styles.cashInput}
              placeholder="Or type amount received"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="decimal-pad"
              value={cashReceived}
              onChangeText={setCashReceived}
            />
            {changeAmount !== null && (
              <View style={[styles.changeRow, changeAmount < 0 && styles.changeRowInsufficient]}>
                <Text style={styles.changeLabel}>{changeAmount < 0 ? 'Short by' : 'Return change'}</Text>
                <Text style={[styles.changeValue, changeAmount < 0 && { color: theme.colors.danger }]}>
                  {formatINR(Math.abs(changeAmount))}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* UPI placeholder */}
        {paymentMethod === 'UPI' && (
          // UI REDESIGN (2026-10-08): pehle yahan ek grey QR *icon* tha "Customer scans to pay" ke saath —
          // asli QR tha hi nahi (cashier confuse). Ab saaf instruction: cafe ka apna UPI QR/soundbox.
          <View style={styles.upiCard}>
            <Smartphone size={30} color={theme.colors.primary} />
            <Text style={styles.upiText}>Collect {formatINR(estimatedTotal)} on your café's UPI QR</Text>
            <Text style={styles.upiNote}>Check the payment arrived (soundbox / UPI app) before placing the order.</Text>
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
              {paymentMethod === 'CASH' && changeAmount === null ? 'Enter amount received' : `Place order · ${formatINR(estimatedTotal)}`}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },

  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },

  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    backgroundColor: theme.colors.background,
  },

  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.xl,
  },
  summaryCardTitle: {
    fontSize: theme.typography.size.sm,
    fontFamily: theme.typography.font.semibold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryLabel: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  summaryValue: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.sm },
  totalLabel: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  totalValue: { fontSize: theme.typography.size.xl, fontFamily: theme.typography.font.bold, color: theme.colors.primary },

  sectionLabel: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  methodRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
  methodCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  methodCardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  methodLabel: { fontSize: 12, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  methodLabelActive: { color: theme.colors.primary, fontFamily: theme.typography.font.bold},

  cashCard: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  quickCashRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: theme.spacing.sm },
  quickCash: { height: 40, paddingHorizontal: 14, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.borderStrong, backgroundColor: theme.colors.surface, justifyContent: 'center' },
  quickCashActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  quickCashText: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  quickCashTextActive: { color: theme.colors.white },
  cashInput: {
    height: 50,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.size.lg,
    fontFamily: theme.typography.font.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  },
  changeRowInsufficient: { backgroundColor: theme.colors.dangerLight },
  changeLabel: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  changeValue: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.bold, color: theme.colors.primary },

  upiCard: { alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.xxl, gap: theme.spacing.sm },
  upiText: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  upiNote: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center' },

  errorBanner: { backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.md, padding: theme.spacing.md, marginTop: theme.spacing.md },
  errorText: { color: theme.colors.danger, fontSize: 13 , fontFamily: theme.typography.font.regular},

  footer: { padding: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  placeOrderBtn: { height: 54, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  placeOrderBtnDisabled: { opacity: 0.5 },
  placeOrderText: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});