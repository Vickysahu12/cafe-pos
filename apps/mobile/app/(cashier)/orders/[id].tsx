// app/(cashier)/orders/[id].tsx
// USE CASE: Order detail — the ONLY correct place to act on an order (collect payment,
// mark served). This is critical for QR orders specifically: the customer already
// created the order themselves (cashierId: null), so the Cashier must NEVER re-create
// it via billing.tsx — that would double it in revenue reports. This screen exists so
// the Cashier has one clear action ("Collect Payment" / "Mark Served") on the SAME
// order, never a second bill.
// CONNECTED TO: orders.api.ts (getOrderById, payOrder, updateOrderStatus).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Wallet, Smartphone, CreditCard, Check, QrCode as QrIcon, Coffee, ShoppingBag, Truck } from 'lucide-react-native';
import { ordersApi, OrderResponse, PaymentMethod } from '../../../features/orders/orders.api';
import { theme } from '../../../theme';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { value: 'CASH', label: 'Cash', icon: Wallet },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'CARD', label: 'Card', icon: CreditCard },
];

const TYPE_ICON = { DINE_IN: Coffee, TAKEAWAY: ShoppingBag, DELIVERY: Truck };

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await ordersApi.getOrderById(id);
      setOrder(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCollectPayment = async () => {
    setProcessing(true);
    try {
      const updated = await ordersApi.payOrder(id, { paymentMethod: selectedMethod });
      setOrder(updated);
      Alert.alert('Payment Collected', `₹${updated.netAmount} received via ${selectedMethod}`);
    } catch {
      Alert.alert('Something went wrong', 'Could not record the payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkServed = async () => {
    setProcessing(true);
    try {
      await ordersApi.updateOrderStatus(id, 'SERVED');
      load();
    } catch {
      Alert.alert('Something went wrong', 'Could not update the order. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const isQrOrder = !order.tableId && order.orderType !== 'DINE_IN' ? false : false; // placeholder, real check below
  const TypeIcon = TYPE_ICON[order.orderType];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Order #{order.orderNumber}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Source badge — makes it visually obvious this order came from the customer, not this Cashier */}
        <View style={styles.sourceRow}>
          <View style={styles.sourceBadge}>
            <TypeIcon size={14} color={theme.colors.textSecondary} />
            <Text style={styles.sourceBadgeText}>{order.orderType.replace('_', ' ')}</Text>
          </View>
          {!order.cashierId && (
            <View style={styles.qrBadge}>
              <QrIcon size={12} color={theme.colors.primary} />
              <Text style={styles.qrBadgeText}>Placed by customer (QR)</Text>
            </View>
          )}
        </View>

        {/* Items — read-only, this order is already final, never re-added here */}
        <Text style={styles.sectionLabel}>ITEMS</Text>
        <View style={styles.card}>
          {order.items.map((item, i) => (
            <View key={item.id} style={[styles.itemRow, i !== order.items.length - 1 && styles.itemRowDivider]}>
              <Text style={styles.itemName}>{item.quantity}× {item.product.name}</Text>
              <Text style={styles.itemPrice}>₹{item.totalPrice}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>₹{order.totalAmount}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>₹{order.taxAmount}</Text>
          </View>
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>₹{order.netAmount}</Text>
          </View>
        </View>

        {/* Payment section — THIS is the action for a QR order, never re-billing */}
        {order.paymentStatus === 'UNPAID' ? (
          <>
            <Text style={styles.sectionLabel}>COLLECT PAYMENT</Text>
            <View style={styles.methodRow}>
              {PAYMENT_METHODS.map((m) => {
                const active = selectedMethod === m.value;
                return (
                  <Pressable key={m.value} style={[styles.methodCard, active && styles.methodCardActive]} onPress={() => setSelectedMethod(m.value)}>
                    <m.icon size={20} color={active ? theme.colors.success : theme.colors.textSecondary} />
                    <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>{m.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Pressable style={styles.actionButton} onPress={handleCollectPayment} disabled={processing}>
              {processing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>Collect ₹{order.netAmount}</Text>}
            </Pressable>
          </>
        ) : (
          <View style={styles.paidBanner}>
            <Check size={16} color={theme.colors.success} />
            <Text style={styles.paidBannerText}>Paid via {order.paymentMethod}</Text>
          </View>
        )}

        {/* Serve action — independent of payment, kitchen-side readiness */}
        {order.orderStatus === 'READY' && (
          <Pressable style={[styles.actionButton, styles.serveButton]} onPress={handleMarkServed} disabled={processing}>
            <Text style={styles.actionButtonText}>Mark as Served</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { width: 38, height: 38, borderRadius: theme.radius.full, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },

  sourceRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.full },
  sourceBadgeText: { fontSize: 12, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary, textTransform: 'capitalize' },
  qrBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.primaryLight, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.full },
  qrBadgeText: { fontSize: 12, fontWeight: theme.typography.weight.semibold, color: theme.colors.primary },

  sectionLabel: { fontSize: 12, fontWeight: theme.typography.weight.bold, color: theme.colors.textMuted, letterSpacing: 0.6, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.xs },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: theme.spacing.xs },
  itemName: { fontSize: theme.typography.size.sm, color: theme.colors.textPrimary },
  itemPrice: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 13, color: theme.colors.textSecondary },
  totalValue: { fontSize: 13, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary },
  grandRow: { marginTop: 4, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  grandLabel: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  grandValue: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.primary },

  methodRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  methodCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: theme.spacing.md, borderRadius: theme.radius.lg, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  methodCardActive: { borderColor: theme.colors.success, backgroundColor: theme.colors.successLight },
  methodLabel: { fontSize: 12, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary },
  methodLabelActive: { color: theme.colors.success, fontWeight: theme.typography.weight.bold },

  actionButton: { height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.md },
  actionButtonText: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
  serveButton: { backgroundColor: theme.colors.success },

  paidBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.successLight, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  paidBannerText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.success },
});