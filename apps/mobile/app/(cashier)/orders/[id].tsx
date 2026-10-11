// app/(cashier)/orders/[id].tsx
// USE CASE: Order detail — the ONLY correct place to act on an order (collect payment,
// mark served). This is critical for QR orders specifically: the customer already
// created the order themselves (cashierId: null), so the Cashier must NEVER re-create
// it via billing.tsx — that would double it in revenue reports. This screen exists so
// the Cashier has one clear action ("Collect Payment" / "Mark Served") on the SAME
// order, never a second bill.
// CONNECTED TO: orders.api.ts (getOrderById, payOrder, updateOrderStatus, voidOrder).
//
// FIX (2026-09-30):
//  - "Cancel Order" button (sirf Owner/Manager) + reason sheet — backend /void pehle
//    se tha lekin app mein koi button nahi tha, Owner galat order cancel hi nahi kar sakta tha.
//  - Cancelled order pe ab "Collect payment" nahi dikhta (pehle dikhta tha) — "Cancelled" banner.
//  - REFUNDED order pe "Paid via null" ki jagah "Cancelled & refunded".
//  - Errors ab backend ka asli message dikhate hain (pehle hamesha generic "Something went wrong").
//
// ADDED (2026-10-05): "Send bill on WhatsApp" — paid order pe hara button + payment ke
// turant baad alert mein "Send bill" option (dekho components/orders/ShareBillSheet.tsx).
//
// ADDED (2026-10-06): CUSTOMER card — QR order ka naam + mobile + 📞 Call button (customer table
// se uth gaya / takeaway ready hai). WhatsApp bill mein number pehle se bhara. Phone sirf
// Owner/Manager/Cashier ko (backend Chef ko null bhejta hai); 30 din baad server se delete.
//
// ADDED (2026-10-09) — STOCK SOP: cancel sheet mein "Khana ban chuka tha?" — sirf tab jab is order
// mein recipe wala item ho (recipe nahi use karne wale cafe ko yeh sawaal kabhi nahi dikhta).
// Default kitchen status se: New → "Not made" (stock wapas), Preparing/Ready/Served → "Already made"
// (wastage). Manager badal sakta hai. Item ke saath size bhi dikhta hai ("Latte · Large").
//
// ADDED (2026-10-11) — COMPLIMENTARY: free items pe "Free" tag (purana price kata hua). Unpaid order
// pe Owner/Manager "Make complimentary" → items chuno (ya poora bill) + reason → server total
// dobara nikalta hai. Poora free → order PAID (₹0), collect payment ki zaroorat nahi.
//
// ADDED (2026-10-11) — DELIVERY (website orders): address card + "Open in Maps", delivery charge
// (Owner/Manager unpaid pe badal sakte hain), aur "Mark as Served" ki jagah delivery steps:
// Ready → "Out for delivery" → "Mark delivered" (delivered = served, list se hat jaata hai).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Wallet, Smartphone, CreditCard, Check, QrCode as QrIcon, Coffee, ShoppingBag, Truck, XCircle, Phone, UserRound, Gift, Square, CheckSquare, Bike, MapPin, Pencil } from 'lucide-react-native';
import { CompReasonPicker, isValidCompReason } from '../../../components/orders/CompReasonPicker'; // ADDED (2026-10-11)
import { ordersApi, OrderResponse, PaymentMethod } from '../../../features/orders/orders.api';
import { inventoryApi } from '../../../features/inventory/inventory.api'; // ADDED (2026-10-09)
import { useAuthStore } from '../../../features/auth/auth.store';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { TextField } from '../../../components/ui/TextField';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { SendBillButton, ShareBillSheet } from '../../../components/orders/ShareBillSheet';
import { getErrorMessage } from '../../../lib/api-client';
import { haptics } from '../../../lib/haptics';
import { theme } from '../../../theme';

import { formatINR } from '../../../lib/format'; // UI REDESIGN (2026-10-08): ₹1,250 format, float ka kachra nahi
import { ui } from '../../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ComponentType<{ size: number; color: string }> }[] = [
  { value: 'CASH', label: 'Cash', icon: Wallet },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'CARD', label: 'Card', icon: CreditCard },
];

const TYPE_ICON = { DINE_IN: Coffee, TAKEAWAY: ShoppingBag, DELIVERY: Truck };
// UI REDESIGN (2026-10-08): human labels
const TYPE_LABEL = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' } as const;
const METHOD_LABEL: Record<string, string> = { CASH: 'Cash', UPI: 'UPI', CARD: 'Card', CREDIT: 'Credit', SPLIT: 'Split' };

export default function OrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');
  const [processing, setProcessing] = useState(false);

  // FIX (2026-09-30): void (cancel) — sirf Owner/Manager (backend bhi yahi enforce karta hai)
  const role = useAuthStore((s) => s.user?.role);
  const canVoid = role === 'OWNER' || role === 'MANAGER';
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  // ADDED (2026-10-09): Stock SOP — is order mein recipe wale items hain? (null = abhi pata nahi)
  const [hasRecipeItems, setHasRecipeItems] = useState<boolean | null>(null);
  const [foodMade, setFoodMade] = useState(false);
  // ADDED (2026-10-11): COMPLIMENTARY sheet
  const [compOpen, setCompOpen] = useState(false);
  const [compIds, setCompIds] = useState<string[]>([]);
  const [compReason, setCompReason] = useState('');
  const [compError, setCompError] = useState<string | null>(null);
  const [compSaving, setCompSaving] = useState(false);

  // ADDED (2026-10-11): DELIVERY
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeText, setChargeText] = useState('');
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [chargeSaving, setChargeSaving] = useState(false);
  const isDelivery = order?.orderType === 'DELIVERY';

  const advanceDelivery = async (next: 'OUT_FOR_DELIVERY' | 'DELIVERED') => {
    if (!order || processing) return;
    setProcessing(true);
    try {
      const updated = await ordersApi.updateDelivery(order.id, { deliveryStatus: next });
      setOrder(updated);
      haptics.success();
    } catch (err) {
      haptics.error();
      Alert.alert('Could not update delivery', getErrorMessage(err));
    } finally {
      setProcessing(false);
    }
  };
  const saveCharge = async () => {
    if (!order || chargeSaving) return;
    const v = Number(chargeText.replace(',', '.'));
    if (chargeText.trim() === '' || !Number.isFinite(v) || v < 0) return setChargeError('Enter a valid amount (0 for free delivery)');
    if (v > 2000) return setChargeError('That charge is too high');
    setChargeSaving(true);
    setChargeError(null);
    try {
      const updated = await ordersApi.updateDelivery(order.id, { deliveryCharge: Math.round(v * 100) / 100 });
      setOrder(updated);
      setChargeOpen(false);
      haptics.success();
    } catch (err) {
      haptics.error();
      setChargeError(getErrorMessage(err));
    } finally {
      setChargeSaving(false);
    }
  };

  const openComp = () => {
    setCompIds([]);
    setCompReason('');
    setCompError(null);
    setCompOpen(true);
  };
  const handleComp = async () => {
    if (!order || compSaving) return;
    const free = order.items.filter((i) => !i.isComplimentary);
    if (compIds.length === 0) return setCompError('Pick at least one item');
    if (!isValidCompReason(compReason)) return setCompError('Pick or write a reason');
    setCompSaving(true);
    setCompError(null);
    try {
      const all = compIds.length === free.length;
      const updated = await ordersApi.makeComplimentary(order.id, all ? 'all' : compIds, compReason.trim());
      setOrder(updated);
      setCompOpen(false);
      haptics.success();
      if (updated.paymentStatus === 'PAID') {
        Alert.alert('Complimentary', `Order #${updated.orderNumber} is now fully complimentary. Nothing to collect.`);
      }
    } catch (err) {
      haptics.error();
      setCompError(getErrorMessage(err));
    } finally {
      setCompSaving(false);
    }
  };

  const openVoid = () => {
    setVoidError(null);
    setVoidOpen(true);
    if (!order) return;
    // Kitchen ne shuru kar diya tha → default "Already made"
    setFoodMade(order.orderStatus !== 'PENDING');
    setHasRecipeItems(null);
    inventoryApi
      .getRecipeSummary()
      .then((summary) => setHasRecipeItems(order.items.some((i) => !!summary[i.productId])))
      .catch(() => setHasRecipeItems(false)); // pata nahi chala → sawaal mat poocho, purana behaviour (stock wapas)
  };
  const [billOpen, setBillOpen] = useState(false); // ADDED (2026-10-05): WhatsApp bill sheet

  const handleVoid = async () => {
    if (voidReason.trim().length < 5) {
      setVoidError('Please write a reason (at least 5 characters)');
      return;
    }
    setVoiding(true);
    setVoidError(null);
    try {
      // ADDED (2026-10-09): recipe wale items ho tabhi foodMade bhejte hain
      const updated = await ordersApi.voidOrder(id, voidReason.trim(), hasRecipeItems ? foodMade : undefined);
      setOrder(updated);
      setVoidOpen(false);
      setVoidReason('');
      Alert.alert(
        'Order cancelled',
        updated.paymentStatus === 'REFUNDED'
          ? `Order #${updated.orderNumber} cancelled. It was already paid — return ₹${updated.netAmount} to the customer.`
          : `Order #${updated.orderNumber} cancelled.`
      );
    } catch (err) {
      setVoidError(getErrorMessage(err));
    } finally {
      setVoiding(false);
    }
  };

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
      haptics.success(); // FIX (2026-09-30): payment confirm feel
      // ADDED (2026-10-05): payment ke turant baad hi bill bhejne ka option (customer abhi saamne hai)
      Alert.alert('Payment Collected', `${formatINR(updated.netAmount)} received via ${METHOD_LABEL[selectedMethod] ?? selectedMethod}`, [
        { text: 'Done', style: 'cancel' },
        { text: 'Send bill on WhatsApp', onPress: () => setBillOpen(true) },
      ]);
    } catch (err) {
      haptics.error();
      Alert.alert('Could not record payment', getErrorMessage(err));
      load(); // e.g. doosre device ne pehle hi pay kar diya — latest state dikhao
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkServed = async () => {
    setProcessing(true);
    try {
      await ordersApi.updateOrderStatus(id, 'SERVED');
      load();
    } catch (err) {
      Alert.alert('Could not update order', getErrorMessage(err));
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

  const TypeIcon = TYPE_ICON[order.orderType];
  const isCancelled = order.orderStatus === 'CANCELLED';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Order #{order.orderNumber}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Source badge — makes it visually obvious this order came from the customer, not this Cashier */}
        <View style={styles.sourceRow}>
          <View style={styles.sourceBadge}>
            <TypeIcon size={14} color={theme.colors.textSecondary} />
            <Text style={styles.sourceBadgeText}>{TYPE_LABEL[order.orderType]}</Text>
          </View>
          {!order.cashierId && (
            <View style={styles.qrBadge}>
              <QrIcon size={12} color={theme.colors.primary} />
              <Text style={styles.qrBadgeText}>Placed by customer (QR)</Text>
            </View>
          )}
        </View>

        {/* ADDED (2026-10-06): Customer — naam + 📞 Call (QR order pe customer khud deta hai) */}
        {(order.customerName || order.customerPhone) && (
          <View style={[styles.card, styles.customerCard]}>
            <View style={styles.customerIcon}>
              <UserRound size={18} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName} numberOfLines={1}>{order.customerName ?? 'Customer'}</Text>
              {order.customerPhone ? (
                <Text style={styles.customerPhone}>+91 {order.customerPhone.replace(/(\d{5})(\d{5})/, '$1 $2')}</Text>
              ) : (
                <Text style={styles.customerPhoneMuted}>No number shared</Text>
              )}
            </View>
            {!!order.customerPhone && (
              <Pressable
                style={({ pressed }) => [styles.callBtn, pressed && { opacity: 0.85 }]}
                onPress={() => Linking.openURL(`tel:+91${order.customerPhone}`)}
                accessibilityRole="button"
                accessibilityLabel={`Call ${order.customerName ?? 'customer'}`}
              >
                <Phone size={16} color="#FFFFFF" />
                <Text style={styles.callBtnText}>Call</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ADDED (2026-10-11): DELIVERY card — address (kitchen ko nahi dikhta) */}
        {isDelivery && (
          <View style={styles.card}>
            <View style={styles.deliveryTop}>
              <View style={styles.deliveryIcon}>
                <Bike size={18} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.deliveryTitle}>Delivery</Text>
                <Text style={styles.deliveryStatus}>
                  {order.orderStatus === 'CANCELLED'
                    ? 'Cancelled'
                    : order.deliveryStatus === 'DELIVERED'
                      ? 'Delivered'
                      : order.deliveryStatus === 'OUT_FOR_DELIVERY'
                        ? 'Out for delivery'
                        : order.orderStatus === 'READY'
                          ? 'Ready to send'
                          : 'Being prepared'}
                </Text>
              </View>
            </View>
            {order.deliveryAddress ? (
              <>
                <Text style={styles.deliveryAddress} selectable>{order.deliveryAddress}</Text>
                <Pressable
                  style={styles.mapsBtn}
                  onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress!)}`)}
                  accessibilityRole="button"
                >
                  <MapPin size={16} color={theme.colors.accentInk} />
                  <Text style={styles.mapsBtnText}>Open in Maps</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.deliveryStatus}>Address removed after 30 days (privacy).</Text>
            )}
          </View>
        )}

        {/* Items — read-only, this order is already final, never re-added here */}
        <Text style={styles.sectionLabel}>Items</Text>
        <View style={styles.card}>
          {order.items.map((item, i) => (
            <View key={item.id} style={[styles.itemRow, i !== order.items.length - 1 && styles.itemRowDivider]}>
              <Text style={styles.itemName}>
                {item.quantity}× {item.product.name}
                {/* ADDED (2026-10-09): size */}
                {item.variantName ? <Text style={styles.itemSize}> · {item.variantName}</Text> : null}
              </Text>
              {/* ADDED (2026-10-11): free item */}
              {item.isComplimentary ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.itemPrice, { color: theme.colors.success }]}>Free</Text>
                  <Text style={styles.itemStruck}>{formatINR(item.compValue ?? item.unitPrice * item.quantity)}</Text>
                </View>
              ) : (
                <Text style={styles.itemPrice}>{formatINR(item.totalPrice)}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.card}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatINR(order.totalAmount)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{formatINR(order.taxAmount)}</Text>
          </View>
          {/* ADDED (2026-10-11): DELIVERY charge — Owner/Manager unpaid pe badal sakte hain */}
          {isDelivery && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Delivery</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.totalValue}>{(order.deliveryCharge ?? 0) > 0 ? formatINR(order.deliveryCharge!) : 'Free'}</Text>
                {canVoid && order.paymentStatus === 'UNPAID' && !isCancelled && (
                  <Pressable
                    onPress={() => { setChargeText(String(order.deliveryCharge ?? 0)); setChargeError(null); setChargeOpen(true); }}
                    hitSlop={10}
                    accessibilityLabel="Change delivery charge"
                  >
                    <Pencil size={14} color={theme.colors.accentInk} />
                  </Pressable>
                )}
              </View>
            </View>
          )}
          {/* ADDED (2026-10-11) */}
          {(order.complimentaryValue ?? 0) > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Complimentary (not charged)</Text>
              <Text style={[styles.totalValue, { color: theme.colors.success }]}>{formatINR(order.complimentaryValue!)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>{formatINR(order.netAmount)}</Text>
          </View>
        </View>

        {/* Payment section — THIS is the action for a QR order, never re-billing */}
        {isCancelled ? (
          <View style={styles.cancelledBanner}>
            <XCircle size={16} color={theme.colors.danger} />
            <Text style={styles.cancelledBannerText}>
              {order.paymentStatus === 'REFUNDED' ? 'Cancelled & refunded' : 'Cancelled'}
            </Text>
          </View>
        ) : order.paymentStatus === 'UNPAID' ? (
          <>
            <Text style={styles.sectionLabel}>Collect payment</Text>
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
              {processing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.actionButtonText}>Collect {formatINR(order.netAmount)}</Text>}
            </Pressable>
            {/* ADDED (2026-10-11): COMPLIMENTARY — sirf Owner/Manager, unpaid order */}
            {canVoid && order.items.some((i) => !i.isComplimentary) && (
              <Pressable style={styles.compButton} onPress={openComp} accessibilityRole="button">
                <Gift size={16} color={theme.colors.accentInk} />
                <Text style={styles.compButtonText}>Make complimentary</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.paidBanner}>
            <Check size={16} color={theme.colors.success} />
            {/* UI REDESIGN (2026-10-08): "Paid via CASH" → "Paid · Cash" (raw DB word nahi) */}
            <Text style={styles.paidBannerText}>Paid · {order.paymentMethod ? METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod : '—'}</Text>
          </View>
        )}

        {/* ADDED (2026-10-05): digital bill — sirf paid (aur cancel na hua) order pe */}
        {!isCancelled && order.paymentStatus === 'PAID' && <SendBillButton onPress={() => setBillOpen(true)} />}

        {/* Serve action — independent of payment, kitchen-side readiness */}
        {!isDelivery && order.orderStatus === 'READY' && (
          <Pressable style={[styles.actionButton, styles.serveButton]} onPress={handleMarkServed} disabled={processing}>
            <Text style={styles.actionButtonText}>Mark as Served</Text>
          </Pressable>
        )}
        {/* ADDED (2026-10-11): DELIVERY steps */}
        {isDelivery && !isCancelled && order.orderStatus === 'READY' && (order.deliveryStatus ?? 'PLACED') === 'PLACED' && (
          <Pressable style={[styles.actionButton, styles.serveButton]} onPress={() => advanceDelivery('OUT_FOR_DELIVERY')} disabled={processing}>
            <Text style={styles.actionButtonText}>Out for delivery</Text>
          </Pressable>
        )}
        {isDelivery && !isCancelled && order.deliveryStatus === 'OUT_FOR_DELIVERY' && (
          <Pressable style={[styles.actionButton, styles.serveButton]} onPress={() => advanceDelivery('DELIVERED')} disabled={processing}>
            <Text style={styles.actionButtonText}>Mark delivered</Text>
          </Pressable>
        )}

        {canVoid && !isCancelled && (
          <Pressable style={styles.voidButton} onPress={openVoid}>
            <Text style={styles.voidButtonText}>Cancel Order</Text>
          </Pressable>
        )}
      </ScrollView>

      <ShareBillSheet
        visible={billOpen}
        onClose={() => setBillOpen(false)}
        orderId={order.id}
        orderNumber={order.orderNumber}
        netAmount={order.netAmount}
        initialPhone={order.customerPhone} // ADDED (2026-10-06): number pehle se bhara
      />

      {/* ADDED (2026-10-11): DELIVERY charge sheet */}
      <BottomSheet visible={chargeOpen} onClose={() => !chargeSaving && setChargeOpen(false)} title="Delivery charge">
        {chargeError && <ErrorBanner message={chargeError} />}
        <TextField
          label="Charge for this order (₹)"
          placeholder="e.g. 30"
          keyboardType="decimal-pad"
          value={chargeText}
          onChangeText={(t) => { setChargeText(t.replace(/[^0-9.]/g, '').slice(0, 7)); if (chargeError) setChargeError(null); }}
          autoFocus
        />
        <Text style={styles.voidHint}>Enter 0 for free delivery. The bill total updates right away.</Text>
        <Button title="Save" onPress={saveCharge} loading={chargeSaving} />
      </BottomSheet>

      {/* ADDED (2026-10-11): COMPLIMENTARY sheet */}
      <BottomSheet visible={compOpen} onClose={() => !compSaving && setCompOpen(false)} title="Make complimentary">
        {compError && <ErrorBanner message={compError} />}
        <Text style={styles.voidHint}>Free items are not charged. Stock still goes down, and the reason is saved in reports.</Text>
        {(() => {
          const free = order.items.filter((i) => !i.isComplimentary);
          const allPicked = compIds.length === free.length && free.length > 0;
          return (
            <View style={styles.compList}>
              <Pressable
                style={styles.compRow}
                onPress={() => { haptics.tap(); setCompIds(allPicked ? [] : free.map((i) => i.id)); }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: allPicked }}
              >
                {allPicked ? <CheckSquare size={20} color={theme.colors.primary} /> : <Square size={20} color={theme.colors.textMuted} />}
                <Text style={[styles.compRowName, { fontFamily: theme.typography.font.semibold }]}>Whole bill</Text>
                <Text style={styles.compRowPrice}>{formatINR(free.reduce((s, i) => s + i.totalPrice, 0))}</Text>
              </Pressable>
              {free.map((i) => {
                const on = compIds.includes(i.id);
                return (
                  <Pressable
                    key={i.id}
                    style={[styles.compRow, styles.compRowBorder]}
                    onPress={() => { haptics.tap(); setCompIds((ids) => (on ? ids.filter((x) => x !== i.id) : [...ids, i.id])); }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    {on ? <CheckSquare size={20} color={theme.colors.primary} /> : <Square size={20} color={theme.colors.textMuted} />}
                    <Text style={styles.compRowName} numberOfLines={1}>
                      {i.quantity}× {i.product.name}{i.variantName ? ` · ${i.variantName}` : ''}
                    </Text>
                    <Text style={styles.compRowPrice}>{formatINR(i.totalPrice)}</Text>
                  </Pressable>
                );
              })}
            </View>
          );
        })()}
        <Text style={styles.compLabel}>Why is this free?</Text>
        <CompReasonPicker value={compReason} onChange={(v) => { setCompReason(v); if (compError) setCompError(null); }} />
        <Button title="Make free" onPress={handleComp} loading={compSaving} style={{ marginTop: theme.spacing.md }} />
      </BottomSheet>

      <BottomSheet visible={voidOpen} onClose={() => setVoidOpen(false)} title={`Cancel Order #${order.orderNumber}?`}>
        {voidError && <ErrorBanner message={voidError} />}
        <Text style={styles.voidHint}>
          {order.paymentStatus === 'PAID'
            ? `This order is already paid (₹${order.netAmount}). It will be marked refunded.`
            : 'The kitchen will stop preparing it.'}{' '}
          The reason is saved in the Owner's audit logs.
        </Text>
        <TextField
          label="Reason"
          placeholder="e.g. Customer changed their mind"
          value={voidReason}
          onChangeText={(v) => { setVoidReason(v); if (voidError) setVoidError(null); }}
          maxLength={300}
        />
        {/* ADDED (2026-10-09): Stock SOP — sirf recipe wale orders pe */}
        {hasRecipeItems && (
          <View style={styles.madeBlock}>
            <Text style={styles.madeLabel}>Was the food already made?</Text>
            <View style={styles.madeRow} accessibilityRole="radiogroup">
              {[
                { made: false, title: 'Not made', sub: 'Ingredients go back to stock' },
                { made: true, title: 'Already made', sub: 'Counted as wastage' },
              ].map((o) => {
                const active = foodMade === o.made;
                return (
                  <Pressable
                    key={o.title}
                    style={[styles.madeOption, active && styles.madeOptionActive]}
                    onPress={() => { haptics.tap(); setFoodMade(o.made); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                  >
                    <Text style={[styles.madeTitle, active && styles.madeTitleActive]}>{o.title}</Text>
                    <Text style={styles.madeSub}>{o.sub}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <Button
          title="Cancel order"
          onPress={handleVoid}
          loading={voiding}
          disabled={hasRecipeItems === null && voidOpen}
          style={{ backgroundColor: theme.colors.danger }}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },

  sourceRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  sourceBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.full },
  sourceBadgeText: { fontSize: 12, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, textTransform: 'capitalize' },
  qrBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.colors.primaryLight, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.full },
  qrBadgeText: { fontSize: 12, fontFamily: theme.typography.font.semibold, color: theme.colors.primary },

  // ADDED (2026-10-06): customer card
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  customerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  customerName: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  customerPhone: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  customerPhoneMuted: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: 2 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: theme.radius.full, backgroundColor: theme.colors.success },
  callBtnText: { color: '#FFFFFF', fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.bold},

  sectionLabel: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.lg }, // UI REDESIGN (2026-10-08): ALL-CAPS + tracking → sentence case (padhne mein aasaan)
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.xs },
  itemRowDivider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border, marginBottom: theme.spacing.xs },
  itemName: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary },
  itemPrice: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalLabel: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  totalValue: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
  grandRow: { marginTop: 4, paddingTop: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.border },
  grandLabel: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  grandValue: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.bold, color: theme.colors.primary },

  methodRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  methodCard: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: theme.spacing.md, borderRadius: theme.radius.lg, borderWidth: 1.5, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  methodCardActive: { borderColor: theme.colors.success, backgroundColor: theme.colors.successLight },
  methodLabel: { fontSize: 12, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  methodLabelActive: { color: theme.colors.success, fontFamily: theme.typography.font.bold},

  actionButton: { height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.md },
  actionButtonText: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
  serveButton: { backgroundColor: theme.colors.success },

  paidBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.successLight, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  paidBannerText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.success },

  cancelledBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  cancelledBannerText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.danger },
  voidButton: { alignItems: 'center', paddingVertical: theme.spacing.lg, marginTop: theme.spacing.sm },
  voidButtonText: { color: theme.colors.danger, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
  // ADDED (2026-10-09): food made choice
  madeBlock: { marginBottom: theme.spacing.lg },
  madeLabel: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  madeRow: { flexDirection: 'row', gap: theme.spacing.sm },
  madeOption: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: 12, backgroundColor: theme.colors.surface },
  madeOptionActive: { borderColor: theme.colors.primary, borderWidth: 2, padding: 11, backgroundColor: theme.colors.primaryLight },
  madeTitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  madeTitleActive: { color: theme.colors.primary },
  madeSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  itemSize: { color: theme.colors.textSecondary }, // ADDED (2026-10-09)
  // ADDED (2026-10-11): DELIVERY
  deliveryTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  deliveryIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  deliveryTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  deliveryStatus: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginTop: 2 },
  deliveryAddress: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary, lineHeight: 20, marginTop: theme.spacing.md },
  mapsBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 40, marginTop: theme.spacing.sm },
  mapsBtnText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },
  // ADDED (2026-10-11): COMPLIMENTARY
  itemStruck: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, textDecorationLine: 'line-through', marginTop: 1 },
  compButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, marginTop: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  compButtonText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },
  compList: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12, marginBottom: theme.spacing.md },
  compRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  compRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  compRowName: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
  compRowPrice: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  compLabel: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  voidHint: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: theme.spacing.md },
});