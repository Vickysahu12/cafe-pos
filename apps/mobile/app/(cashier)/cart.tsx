// app/(cashier)/cart.tsx
// USE CASE: Cart review screen — line items with quantity steppers, order-type toggle
//           (Dine-In requires picking a table), and a proceed-to-checkout button.
//           Uses the exact same premium card language as Billing/Dashboard.
// CONNECTED TO: cart.store.ts, tables.api.ts (table picker). Proceeds to checkout.tsx.

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Minus, X, Armchair, ShoppingBag, Check } from 'lucide-react-native';
import { useCartStore } from '../../features/cart/cart.store';
import { tablesApi, Table } from '../../features/tables/tables.api';
import { theme } from '../../theme';

export default function CartScreen() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const orderType = useCartStore((s) => s.orderType);
  const tableId = useCartStore((s) => s.tableId);
  const tableNumber = useCartStore((s) => s.tableNumber);
  const incrementItem = useCartStore((s) => s.incrementItem);
  const decrementItem = useCartStore((s) => s.decrementItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const setTable = useCartStore((s) => s.setTable);
  const setOrderType = useCartStore((s) => s.setOrderType);
  const subtotal = useCartStore((s) => s.subtotal());

  const [tables, setTables] = useState<Table[]>([]);
  const [tablePickerVisible, setTablePickerVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      tablesApi.getTables().then(setTables).catch(() => {});
    }, [])
  );

  const estimatedTax = Math.round(subtotal * 0.05); // display-only estimate — backend recalculates the real tax per-item
  const estimatedTotal = subtotal + estimatedTax;

  const handleDineInTap = () => {
    setOrderType('DINE_IN');
    setTablePickerVisible(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Your Cart</Text>
        <View style={{ width: 38 }} />
      </View>

      {items.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconBadge}>
            <ShoppingBag size={26} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Pressable style={styles.backToBillingBtn} onPress={() => router.back()}>
            <Text style={styles.backToBillingText}>Browse Menu</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={styles.orderTypeRow}>
                <Pressable
                  style={[styles.orderTypeChip, orderType === 'TAKEAWAY' && styles.orderTypeChipActive]}
                  onPress={() => setOrderType('TAKEAWAY')}
                >
                  <ShoppingBag size={15} color={orderType === 'TAKEAWAY' ? theme.colors.white : theme.colors.textSecondary} />
                  <Text style={[styles.orderTypeText, orderType === 'TAKEAWAY' && styles.orderTypeTextActive]}>Takeaway</Text>
                </Pressable>
                <Pressable
                  style={[styles.orderTypeChip, orderType === 'DINE_IN' && styles.orderTypeChipActive]}
                  onPress={handleDineInTap}
                >
                  <Armchair size={15} color={orderType === 'DINE_IN' ? theme.colors.white : theme.colors.textSecondary} />
                  <Text style={[styles.orderTypeText, orderType === 'DINE_IN' && styles.orderTypeTextActive]}>
                    {orderType === 'DINE_IN' && tableNumber ? `Table ${tableNumber}` : 'Dine-In'}
                  </Text>
                </Pressable>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.lineCard}>
                <View style={styles.lineTextWrap}>
                  <Text style={styles.lineName}>{item.productName}</Text>
                  {(item.variantName || item.addonNames.length > 0) && (
                    <Text style={styles.lineMeta}>
                      {[item.variantName, ...item.addonNames].filter(Boolean).join(' · ')}
                    </Text>
                  )}
                  {item.notes && <Text style={styles.lineNotes}>"{item.notes}"</Text>}
                  <Text style={styles.lineUnitPrice}>₹{item.unitPrice} each</Text>
                </View>

                <View style={styles.lineRight}>
                  <Pressable onPress={() => removeItem(item.key)} hitSlop={8} style={styles.removeBtn}>
                    <X size={14} color={theme.colors.textMuted} />
                  </Pressable>
                  <View style={styles.stepper}>
                    <Pressable style={styles.stepperBtn} onPress={() => decrementItem(item.key)}>
                      <Minus size={13} color={theme.colors.textPrimary} />
                    </Pressable>
                    <Text style={styles.stepperQty}>{item.quantity}</Text>
                    <Pressable style={styles.stepperBtn} onPress={() => incrementItem(item.key)}>
                      <Plus size={13} color={theme.colors.textPrimary} />
                    </Pressable>
                  </View>
                  <Text style={styles.lineTotal}>₹{item.unitPrice * item.quantity}</Text>
                </View>
              </View>
            )}
          />

          <View style={styles.footer}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>₹{subtotal}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax (est.)</Text>
              <Text style={styles.summaryValue}>₹{estimatedTax}</Text>
            </View>
            <View style={[styles.summaryRow, { marginBottom: theme.spacing.md }]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{estimatedTotal}</Text>
            </View>

            <Pressable
              style={styles.checkoutButton}
              onPress={() => router.push('/(cashier)/checkout')}
              disabled={orderType === 'DINE_IN' && !tableId}
            >
              <Text style={styles.checkoutButtonText}>
                {orderType === 'DINE_IN' && !tableId ? 'Select a table to continue' : 'Proceed to Checkout'}
              </Text>
            </Pressable>
          </View>
        </>
      )}

      {/* Table picker modal */}
      <Modal visible={tablePickerVisible} transparent animationType="slide" onRequestClose={() => setTablePickerVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setTablePickerVisible(false)} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Select a Table</Text>
          <FlatList
            data={tables}
            keyExtractor={(t) => t.id}
            numColumns={3}
            columnWrapperStyle={{ gap: theme.spacing.sm }}
            contentContainerStyle={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.lg }}
            renderItem={({ item }) => {
              const isSelected = tableId === item.id;
              const isOccupied = item.status === 'OCCUPIED';
              return (
                <Pressable
                  style={[styles.tableOption, isSelected && styles.tableOptionSelected, isOccupied && styles.tableOptionDisabled]}
                  disabled={isOccupied}
                  onPress={() => {
                    setTable(item.id, item.tableNumber);
                    setTablePickerVisible(false);
                  }}
                >
                  {isSelected && <Check size={12} color={theme.colors.white} style={styles.tableCheck} />}
                  <Text style={[styles.tableOptionText, isSelected && { color: theme.colors.white }]}>T{item.tableNumber}</Text>
                  <Text style={[styles.tableOptionStatus, isSelected && { color: theme.colors.white }]}>
                    {isOccupied ? 'Occupied' : 'Available'}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  iconBtn: { width: 38, height: 38, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },

  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary, marginBottom: theme.spacing.lg },
  backToBillingBtn: { paddingHorizontal: theme.spacing.xl, height: 46, borderRadius: theme.radius.md, backgroundColor: theme.colors.primaryDark, justifyContent: 'center', alignItems: 'center' },
  backToBillingText: { color: theme.colors.white, fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold },

  listContent: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  orderTypeRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  orderTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    height: 40,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    justifyContent: 'center',
  },
  orderTypeChipActive: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  orderTypeText: { fontSize: 13, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },
  orderTypeTextActive: { color: theme.colors.white },

  lineCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  lineTextWrap: { flex: 1, marginRight: theme.spacing.sm },
  lineName: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  lineMeta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  lineNotes: { fontSize: 11, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  lineUnitPrice: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  lineRight: { alignItems: 'flex-end', gap: 6 },
  removeBtn: { padding: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.background, borderRadius: theme.radius.full, paddingHorizontal: 4, height: 30 },
  stepperBtn: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  stepperQty: { fontSize: 13, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, minWidth: 16, textAlign: 'center' },
  lineTotal: { fontSize: 14, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },

  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xs },
  summaryLabel: { fontSize: 13, color: theme.colors.textSecondary },
  summaryValue: { fontSize: 13, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary },
  totalLabel: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  totalValue: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.primaryDark },
  checkoutButton: { height: 54, borderRadius: theme.radius.md, backgroundColor: theme.colors.primaryDark, justifyContent: 'center', alignItems: 'center' },
  checkoutButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },

  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)' },
  sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: theme.spacing.xl, maxHeight: '70%' },
  handle: { width: 40, height: 4, borderRadius: theme.radius.full, backgroundColor: theme.colors.border, alignSelf: 'center', marginBottom: theme.spacing.md },
  sheetTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
  tableOption: { flex: 1, aspectRatio: 1, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', gap: 2 },
  tableOptionSelected: { backgroundColor: theme.colors.primaryDark, borderColor: theme.colors.primaryDark },
  tableOptionDisabled: { opacity: 0.4 },
  tableCheck: { position: 'absolute', top: 4, right: 4 },
  tableOptionText: { fontSize: 13, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  tableOptionStatus: { fontSize: 9, color: theme.colors.textMuted },
});