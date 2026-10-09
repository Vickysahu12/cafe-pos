// app/(admin)/tables.tsx
// USE CASE: Tables grid — dine-in table setup, color-coded by status. "Add Table" opens
//           a bottom-sheet form (table number + capacity only — status always starts AVAILABLE).
// CONNECTED TO: tables.api.ts (getTables, createTable).

import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Armchair, Users as UsersIcon } from 'lucide-react-native';
import { tablesApi, Table } from '../../features/tables/tables.api';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { useScreenLoad } from '../../lib/use-screen-load';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
const STATUS_META: Record<Table['status'], { label: string; color: string; bg: string }> = {
  AVAILABLE: { label: 'Available', color: theme.colors.success, bg: theme.colors.successLight },
  OCCUPIED: { label: 'Occupied', color: theme.colors.danger, bg: theme.colors.dangerLight },
  RESERVED: { label: 'Reserved', color: theme.colors.warning, bg: theme.colors.warningLight },
};

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tableNumber: '', capacity: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // UI/UX PASS (2026-09-30): useScreenLoad (error + retry + refresh + skeleton).
  // Natural sort: backend string sort karta hai ("1, 10, 2") — cafe owner ko "1, 2, 10" chahiye.
  const { loading, refreshing, error, refresh, retry, reload: load } = useScreenLoad(async () => {
    const data = await tablesApi.getTables();
    setTables([...data].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })));
  });

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
    } catch (err) {
      Alert.alert('Could not add table', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* UI REDESIGN (2026-10-09): ab yeh screen "More" grid se khulti hai (tab nahi) → back arrow wapas */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Tables</Text>
        <Text style={styles.subtitle}>{tables.length > 0 ? `${tables.length} table${tables.length === 1 ? '' : 's'} set up` : 'For dine-in orders'}</Text>
      </View>

      {loading ? (
        <View style={[styles.gridContent, { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md }]}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} width="30%" height={120} radius={theme.radius.lg} />
          ))}
        </View>
      ) : error && tables.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={tables}
          keyExtractor={(item) => item.id}
          numColumns={3}
          columnWrapperStyle={{ gap: theme.spacing.md }}
          contentContainerStyle={styles.gridContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          renderItem={({ item }) => {
            const meta = STATUS_META[item.status];
            return (
              <View style={[styles.tableCard, { borderColor: meta.color + '40' }]}>
                <Armchair size={20} color={theme.colors.textSecondary} />
                {/* FIX (2026-09-30): "T5" type kiya ho to "TT5" dikhta tha */}
                <Text style={styles.tableNumber}>{/^t/i.test(item.tableNumber) ? item.tableNumber : `T${item.tableNumber}`}</Text>
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
            <EmptyState
              icon={Armchair}
              title="No tables yet"
              message="Add tables to manage dine-in orders and seating."
              actionLabel="Add First Table"
              onAction={() => setModalVisible(true)}
            />
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add table</Text>
        </Pressable>
      </View>

      <BottomSheet visible={modalVisible} onClose={() => setModalVisible(false)} title="Add table">
        <TextField
          label="Table number"
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
        <Button title="Add table" onPress={handleAdd} loading={saving} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  backButton: { ...ui.iconButton },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontFamily: theme.typography.font.bold, color: theme.colors.white, letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  gridContent: { paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: theme.spacing.xl, flexGrow: 1 },
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
    shadowColor: '#2B1F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  tableNumber: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  capacityText: { fontSize: theme.typography.size.xs, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full, marginTop: 4 },
  statusDot: { width: 5, height: 5, borderRadius: theme.radius.full },
  statusText: { fontSize: 11, fontFamily: theme.typography.font.semibold},
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingTop: theme.spacing.xxl },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.background } /* UI REDESIGN (2026-10-08): separator line hataya */,
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' } /* UI REDESIGN (2026-10-08): brown glow shadow hataya */,
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});