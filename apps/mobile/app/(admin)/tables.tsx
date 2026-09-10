// app/(admin)/tables.tsx
// USE CASE: Tables grid — dine-in table setup, color-coded by status. "Add Table" opens
//           a bottom-sheet form (table number + capacity only — status always starts AVAILABLE).
// CONNECTED TO: tables.api.ts (getTables, createTable).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Plus, Armchair, Users as UsersIcon } from 'lucide-react-native';
import { tablesApi, Table } from '../../features/tables/tables.api';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { theme } from '../../theme';

const STATUS_META: Record<Table['status'], { label: string; color: string; bg: string }> = {
  AVAILABLE: { label: 'Available', color: theme.colors.success, bg: theme.colors.successLight },
  OCCUPIED: { label: 'Occupied', color: theme.colors.danger, bg: theme.colors.dangerLight },
  RESERVED: { label: 'Reserved', color: theme.colors.warning, bg: theme.colors.warningLight },
};

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tableNumber: '', capacity: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await tablesApi.getTables();
      setTables(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = async () => {
    const newErrors: Record<string, string> = {};
    if (!form.tableNumber.trim()) newErrors.tableNumber = 'Required';
    const capacityNum = parseInt(form.capacity, 10);
    if (!capacityNum || capacityNum < 1) newErrors.capacity = 'Enter a valid number';
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setSaving(true);
    try {
      await tablesApi.createTable({ tableNumber: form.tableNumber.trim(), capacity: capacityNum });
      setForm({ tableNumber: '', capacity: '' });
      setModalVisible(false);
      load();
    } catch {
      Alert.alert('Something went wrong', 'Could not add the table. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>TABLES</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Your Tables</Text>
        <Text style={styles.subtitle}>{tables.length > 0 ? `${tables.length} table${tables.length === 1 ? '' : 's'} set up` : 'For dine-in orders'}</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: theme.spacing.md }}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            return (
              <View style={[styles.tableCard, { borderColor: meta.color + '40' }]}>
                <Armchair size={20} color={theme.colors.textSecondary} />
                <Text style={styles.tableNumber}>T{item.tableNumber}</Text>
                <View style={styles.capacityRow}>
                  <UsersIcon size={11} color={theme.colors.textMuted} />
                  <Text style={styles.capacityText}>{item.capacity}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBadge}>
                <Armchair size={28} color={theme.colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No tables yet</Text>
              <Text style={styles.emptyText}>Add tables to manage dine-in orders and seating.</Text>
            </View>
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add Table</Text>
        </Pressable>
      </View>

      <BottomSheet visible={modalVisible} onClose={() => setModalVisible(false)} title="Add Table">
        <TextField
          label="Table Number"
          placeholder="e.g. 5"
          keyboardType="number-pad"
          value={form.tableNumber}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, tableNumber: v }));
            if (errors.tableNumber) setErrors((e) => ({ ...e, tableNumber: '' }));
          }}
          error={errors.tableNumber}
          returnKeyType="next"
        />
        <TextField
          label="Capacity (seats)"
          placeholder="e.g. 4"
          keyboardType="number-pad"
          value={form.capacity}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, capacity: v }));
            if (errors.capacity) setErrors((e) => ({ ...e, capacity: '' }));
          }}
          error={errors.capacity}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Button title="Add Table" onPress={handleAdd} loading={saving} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.white, letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, color: theme.colors.textSecondary },
  gridContent: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md, paddingBottom: theme.spacing.xl, flexGrow: 1 },
  tableCard: {
    flex: 1,
    aspectRatio: 0.9,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.sm,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tableNumber: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  capacityText: { fontSize: theme.typography.size.xs, color: theme.colors.textMuted },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full, marginTop: 4 },
  statusDot: { width: 5, height: 5, borderRadius: theme.radius.full },
  statusText: { fontSize: 10, fontWeight: theme.typography.weight.semibold },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingTop: theme.spacing.xxl },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 54, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: theme.colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 4 },
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});