// app/(admin)/tables.tsx
// USE CASE: Tables grid — dine-in table setup, color-coded by status. "Add Table" opens
//           a bottom-sheet form (table number + capacity only — status always starts AVAILABLE).
// CONNECTED TO: tables.api.ts (getTables, createTable).
//
// UPDATED (2026-10-11) — TABLE EDIT (co-founder brief points 1B + 2):
//  - Table tap → sheet: status, seats, us table ke CHALTE orders (tap → order), "New bill for T4"
//    (cart mein us table ke saath Billing khulta hai), Reserve / Free, Edit, Delete.
//  - Edit: naam + seats. Delete: server chalta order ho to mana karta hai (message dikhta hai);
//    delete = archive, purane bills pe table number wahi rehta hai.
//  - Live: kisi bhi phone pe order bane / pay ho → grid ka status khud badle (useActiveOrders).
//  - Label: sirf number ho to "T5", warna jaisa likha ("Window 1") — pehle "TWindow 1" dikhta.
//  - Owner/Manager hi yeh screen dekhte hain (More → Tables); backend bhi edit/delete pe check karta hai.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Armchair, Users as UsersIcon, Receipt, Pencil, Trash2, CalendarClock, ChevronRight, QrCode } from 'lucide-react-native';
import { tablesApi, Table, tableShort, tableTitle } from '../../features/tables/tables.api';
import { useActiveOrders } from '../../features/orders/useActiveOrders';
import { useCartStore } from '../../features/cart/cart.store';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { PressScale } from '../../components/ui/PressScale';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { useScreenLoad } from '../../lib/use-screen-load';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { formatINR } from '../../lib/format';
import { theme } from '../../theme';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
const STATUS_META: Record<Table['status'], { label: string; color: string; bg: string }> = {
  AVAILABLE: { label: 'Available', color: theme.colors.success, bg: theme.colors.successLight },
  OCCUPIED: { label: 'Occupied', color: theme.colors.danger, bg: theme.colors.dangerLight },
  RESERVED: { label: 'Reserved', color: theme.colors.warning, bg: theme.colors.warningLight },
};

const ORDER_STATUS_LABEL: Record<string, string> = { PENDING: 'New', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served' };


type Sheet = { mode: 'add' } | { mode: 'view'; tableId: string } | { mode: 'edit'; tableId: string } | null;

export default function TablesScreen() {
  const router = useRouter();
  const [tables, setTables] = useState<Table[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tableNumber: '', capacity: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sheetError, setSheetError] = useState<string | null>(null);

  // UI/UX PASS (2026-09-30): useScreenLoad (error + retry + refresh + skeleton).
  // Natural sort: backend string sort karta hai ("1, 10, 2") — cafe owner ko "1, 2, 10" chahiye.
  const { loading, refreshing, error, refresh, retry, reload: load } = useScreenLoad(async () => {
    const data = await tablesApi.getTables();
    setTables([...data].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true })));
  });

  // ADDED (2026-10-11): order events → grid refresh (debounced, rush mein ek hi call)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSoon = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => load(), 700);
  }, [load]);
  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);
  useActiveOrders({ onEvent: refreshSoon });

  const current = sheet && sheet.mode !== 'add' ? tables.find((t) => t.id === sheet.tableId) ?? null : null;
  // Sheet khula tha aur table gayab ho gaya (doosre phone ne delete kiya) → band
  useEffect(() => {
    if (sheet && sheet.mode !== 'add' && !current && !loading) setSheet(null);
  }, [sheet, current, loading]);

  const openAdd = () => {
    setForm({ tableNumber: '', capacity: '' });
    setErrors({});
    setSheetError(null);
    setSheet({ mode: 'add' });
  };
  const openView = (t: Table) => {
    haptics.tap();
    setSheetError(null);
    setSheet({ mode: 'view', tableId: t.id });
  };
  const openEdit = (t: Table) => {
    setForm({ tableNumber: t.tableNumber, capacity: String(t.capacity) });
    setErrors({});
    setSheetError(null);
    setSheet({ mode: 'edit', tableId: t.id });
  };

  const validate = () => {
    const next: Record<string, string> = {};
    const name = form.tableNumber.trim();
    const cap = Number(form.capacity);
    if (!name) next.tableNumber = 'Required';
    else if (name.length > 20) next.tableNumber = 'Keep it under 20 characters';
    if (!Number.isInteger(cap) || cap < 1) next.capacity = 'Enter a number from 1';
    else if (cap > 50) next.capacity = 'That is too many seats for one table';
    setErrors(next);
    return Object.keys(next).length === 0 ? { name, cap } : null;
  };

  const handleSave = async () => {
    if (saving || !sheet) return;
    const v = validate();
    if (!v) return haptics.error();
    setSaving(true);
    setSheetError(null);
    try {
      if (sheet.mode === 'add') await tablesApi.createTable({ tableNumber: v.name, capacity: v.cap });
      else if (sheet.mode === 'edit') await tablesApi.updateTable(sheet.tableId, { tableNumber: v.name, capacity: v.cap });
      haptics.success();
      setSheet(sheet.mode === 'edit' ? { mode: 'view', tableId: sheet.tableId } : null);
      load();
    } catch (err) {
      haptics.error();
      setSheetError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (t: Table) => {
    if ((t.activeOrders?.length ?? 0) > 0) {
      setSheetError(`${tableTitle(t.tableNumber)} has a running order. Finish or cancel it before deleting the table.`);
      haptics.error();
      return;
    }
    Alert.alert(`Delete ${tableTitle(t.tableNumber)}?`, 'Its QR code will stop showing the table. Old bills keep the table name.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await tablesApi.deleteTable(t.id);
            haptics.success();
            setSheet(null);
            load();
          } catch (err) {
            haptics.error();
            setSheetError(getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const setReserved = async (t: Table, reserved: boolean) => {
    try {
      await tablesApi.updateStatus(t.id, reserved ? 'RESERVED' : 'AVAILABLE');
      haptics.tap();
      load();
    } catch (err) {
      setSheetError(getErrorMessage(err));
    }
  };

  const startBill = (t: Table) => {
    const cart = useCartStore.getState();
    const go = () => {
      useCartStore.getState().setTable(t.id, t.tableNumber);
      setSheet(null);
      router.push('/(admin)/billing');
    };
    // Cart mein kisi aur ka adhoora bill pada ho to poochho — galti se do bills mix na hon
    if (cart.items.length > 0 && cart.tableId !== t.id) {
      const count = cart.items.reduce((s, i) => s + i.quantity, 0);
      Alert.alert(
        'Cart already has items',
        `There ${count === 1 ? 'is 1 item' : `are ${count} items`} in the cart${cart.tableNumber ? ` for ${tableTitle(cart.tableNumber)}` : ''}.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear and start', style: 'destructive', onPress: () => { useCartStore.getState().clearCart(); go(); } },
          { text: `Move to ${tableShort(t.tableNumber)}`, onPress: go },
        ]
      );
      return;
    }
    go();
  };

  const freeCount = tables.filter((t) => t.status === 'AVAILABLE').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* UI REDESIGN (2026-10-09): ab yeh screen "More" grid se khulti hai (tab nahi) → back arrow wapas */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Pressable onPress={() => router.push('/(admin)/qr-code')} hitSlop={6} style={styles.backButton} accessibilityLabel="Table QR codes">
          <QrCode size={18} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Tables</Text>
        <Text style={styles.subtitle}>
          {tables.length > 0 ? `${freeCount} of ${tables.length} free · tap a table for orders` : 'For dine-in orders'}
        </Text>
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
          renderItem={({ item, index }) => {
            const meta = STATUS_META[item.status];
            const running = item.activeOrders ?? [];
            const total = running.reduce((s, o) => s + o.netAmount, 0);
            // Aakhri row adhoori ho to cards poori chaudai na lein (3-column grid barabar rahe)
            const isLastRowShort = tables.length % 3 !== 0 && index >= tables.length - (tables.length % 3);
            return (
              <PressScale
                style={[styles.tableCard, { borderColor: meta.color + '55' }, isLastRowShort && styles.tableCardShort]}
                onPress={() => openView(item)}
                accessibilityLabel={`${tableTitle(item.tableNumber)}, ${meta.label}${running.length ? `, ${running.length} running order${running.length === 1 ? '' : 's'}` : ''}`}
              >
                <Armchair size={20} color={theme.colors.textSecondary} />
                <Text style={styles.tableNumber} numberOfLines={1}>{tableShort(item.tableNumber)}</Text>
                <View style={styles.capacityRow}>
                  <UsersIcon size={11} color={theme.colors.textMuted} />
                  <Text style={styles.capacityText}>{item.capacity}</Text>
                  {running.length > 0 && <Text style={styles.capacityText}>· {formatINR(total)}</Text>}
                </View>
                <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                  <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </PressScale>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={Armchair}
              title="No tables yet"
              message="Add tables to manage dine-in orders and seating."
              actionLabel="Add first table"
              onAction={openAdd}
            />
          }
        />
      )}

      {tables.length > 0 && (
        <View style={styles.footer}>
          <Pressable style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.9 }]} onPress={openAdd}>
            <Plus size={18} color={theme.colors.white} />
            <Text style={styles.addButtonText}>Add table</Text>
          </Pressable>
        </View>
      )}

      {/* ── Add / Edit ── */}
      <BottomSheet
        visible={sheet?.mode === 'add' || sheet?.mode === 'edit'}
        onClose={() => !saving && setSheet(sheet?.mode === 'edit' ? { mode: 'view', tableId: sheet.tableId } : null)}
        title={sheet?.mode === 'edit' ? 'Edit table' : 'Add table'}
      >
        {sheetError && <ErrorBanner message={sheetError} />}
        <TextField
          label="Table name or number"
          placeholder="e.g. 5 or Window 1"
          value={form.tableNumber}
          maxLength={20}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, tableNumber: v }));
            if (errors.tableNumber) setErrors((e) => ({ ...e, tableNumber: '' }));
          }}
          error={errors.tableNumber}
          returnKeyType="next"
        />
        <TextField
          label="Seats"
          placeholder="e.g. 4"
          keyboardType="number-pad"
          value={form.capacity}
          maxLength={2}
          onChangeText={(v) => {
            setForm((f) => ({ ...f, capacity: v.replace(/[^0-9]/g, '') }));
            if (errors.capacity) setErrors((e) => ({ ...e, capacity: '' }));
          }}
          error={errors.capacity}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <Button title={sheet?.mode === 'edit' ? 'Save' : 'Add table'} onPress={handleSave} loading={saving} />
      </BottomSheet>

      {/* ── Table detail ── */}
      <BottomSheet visible={sheet?.mode === 'view' && !!current} onClose={() => setSheet(null)} title={current ? tableTitle(current.tableNumber) : ''}>
        {current && (
          <View>
            {sheetError && <ErrorBanner message={sheetError} />}
            <View style={styles.viewMeta}>
              <View style={[styles.statusPill, { backgroundColor: STATUS_META[current.status].bg, marginTop: 0 }]}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_META[current.status].color }]} />
                <Text style={[styles.statusText, { color: STATUS_META[current.status].color }]}>{STATUS_META[current.status].label}</Text>
              </View>
              <Text style={styles.viewSeats}>{current.capacity} seat{current.capacity === 1 ? '' : 's'}</Text>
            </View>

            <Text style={styles.sectionLabel}>Running orders</Text>
            {(current.activeOrders ?? []).length === 0 ? (
              <Text style={styles.noOrders}>No running orders on this table.</Text>
            ) : (
              <View style={styles.ordersCard}>
                {(current.activeOrders ?? []).map((o, i) => (
                  <Pressable
                    key={o.id}
                    style={({ pressed }) => [styles.orderRow, i > 0 && styles.orderRowBorder, pressed && { opacity: 0.7 }]}
                    onPress={() => { setSheet(null); router.push(`/(admin)/orders/${o.id}`); }}
                    accessibilityRole="button"
                  >
                    <Receipt size={16} color={theme.colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderTitle} numberOfLines={1}>
                        #{o.orderNumber}
                        {o.customerName ? ` · ${o.customerName}` : ''}
                        {o.isQr ? ' · QR' : ''}
                      </Text>
                      <Text style={styles.orderSub}>
                        {ORDER_STATUS_LABEL[o.orderStatus] ?? o.orderStatus} · {o.paymentStatus === 'PAID' ? 'Paid' : 'Not paid'}
                      </Text>
                    </View>
                    <Text style={styles.orderAmount}>{formatINR(o.netAmount)}</Text>
                    <ChevronRight size={16} color={theme.colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            )}

            <Button title={`New bill for ${tableShort(current.tableNumber)}`} onPress={() => startBill(current)} style={{ marginTop: theme.spacing.md }} />

            <View style={styles.actionsRow}>
              {(current.activeOrders ?? []).length === 0 && (
                <SheetAction
                  icon={CalendarClock}
                  label={current.status === 'RESERVED' ? 'Free table' : 'Reserve'}
                  onPress={() => setReserved(current, current.status !== 'RESERVED')}
                />
              )}
              <SheetAction icon={Pencil} label="Edit" onPress={() => openEdit(current)} />
              <SheetAction icon={Trash2} label="Delete" danger onPress={() => confirmDelete(current)} />
            </View>
          </View>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function SheetAction({ icon: Icon, label, onPress, danger }: { icon: React.ComponentType<{ size: number; color: string }>; label: string; onPress: () => void; danger?: boolean }) {
  const color = danger ? theme.colors.danger : theme.colors.textPrimary;
  return (
    <Pressable style={({ pressed }) => [styles.sheetAction, pressed && { opacity: 0.7 }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Icon size={17} color={color} />
      <Text style={[styles.sheetActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  backButton: { ...ui.iconButton },
  titleBlock: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
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
  },
  tableCardShort: { flex: 0, width: '31%' },
  tableNumber: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary, maxWidth: '100%' },
  capacityRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  capacityText: { fontSize: theme.typography.size.xs, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, fontVariant: ['tabular-nums'] },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full, marginTop: 4 },
  statusDot: { width: 6, height: 6, borderRadius: theme.radius.full },
  statusText: { fontSize: 11, fontFamily: theme.typography.font.semibold },
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.background },
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold },

  viewMeta: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  viewSeats: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  sectionLabel: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  noOrders: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  ordersCard: { ...ui.card, paddingHorizontal: theme.spacing.md },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 12 },
  orderRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  orderTitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  orderSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  orderAmount: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  actionsRow: { flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  sheetAction: { flex: 1, height: 48, flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  sheetActionText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold },
});
