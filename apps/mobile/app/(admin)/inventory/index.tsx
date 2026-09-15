// app/(admin)/inventory/index.tsx
// USE CASE: Inventory list — shows all stock items, low-stock ones highlighted. Quick
//           +/- buttons adjust quantity inline without opening a separate screen.
// CONNECTED TO: inventory.api.ts. Reached from Dashboard's low-stock alert banner.

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Minus, Package, AlertTriangle } from 'lucide-react-native';
import { inventoryApi, InventoryItem } from '../../../features/inventory/inventory.api';
import { theme } from '../../../theme';

export default function InventoryScreen() {
  const router = useRouter();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await inventoryApi.getItems();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const adjust = async (item: InventoryItem, delta: number) => {
    if (item.quantity + delta < 0) return;
    setBusyId(item.id);
    try {
      const updated = await inventoryApi.updateQuantity(item.id, { mode: 'ADD', quantity: delta });
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: updated.quantity } : i)));
    } finally {
      setBusyId(null);
    }
  };

  const lowStockCount = items.filter((i) => i.quantity <= i.lowStockAlertAt).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Inventory</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Stock Overview</Text>
        <Text style={styles.subtitle}>
          {items.length} item{items.length === 1 ? '' : 's'}
          {lowStockCount > 0 ? ` · ${lowStockCount} running low` : ''}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isLow = item.quantity <= item.lowStockAlertAt;
            return (
              <View style={[styles.itemCard, isLow && styles.itemCardLow]}>
                <View style={[styles.iconBox, { backgroundColor: isLow ? theme.colors.dangerLight : theme.colors.background }]}>
                  {isLow ? <AlertTriangle size={18} color={theme.colors.danger} /> : <Package size={18} color={theme.colors.textSecondary} />}
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={[styles.itemQty, isLow && { color: theme.colors.danger }]}>
                    {item.quantity} {item.unit}
                  </Text>
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    style={[styles.stepperButton, styles.stepperButtonLeft]}
                    onPress={() => adjust(item, -1)}
                    disabled={busyId === item.id || item.quantity <= 0}
                  >
                    <Minus size={14} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Pressable
                    style={[styles.stepperButton, styles.stepperButtonRight]}
                    onPress={() => adjust(item, 1)}
                    disabled={busyId === item.id}
                  >
                    <Plus size={14} color={theme.colors.textPrimary} />
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBadge}>
                <Package size={26} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No inventory items yet</Text>
              <Text style={styles.emptyText}>Track stock like milk, coffee beans, or cups here.</Text>
            </View>
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={() => router.push('/(admin)/inventory/create')}>
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add Item</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  headerTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  titleBlock: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, color: theme.colors.textSecondary },
  listContent: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: theme.spacing.xl, flexGrow: 1 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  itemCardLow: { borderColor: theme.colors.danger + '40' },
  iconBox: { width: 40, height: 40, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  itemTextWrap: { flex: 1 },
  itemName: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  itemQty: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, marginTop: 2 },
  stepper: { flexDirection: 'row', borderRadius: theme.radius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.border },
  stepperButton: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background },
  stepperButtonLeft: { borderRightWidth: 1, borderRightColor: theme.colors.border },
  stepperButtonRight: {},
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingTop: theme.spacing.xxl },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 54, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});