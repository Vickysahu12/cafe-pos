// app/(admin)/inventory/[id].tsx
// ADDED (2026-10-09) — STOCK SOP: ek stock item ki poori kahani (pehle yeh "coming soon" placeholder tha).
//  - Upar: abhi kitna hai (bada), status (Out / Running low), value ₹, cost per unit, alert level
//  - 3 kaam, har ek ka naam (andaaze ka +/- nahi):
//      Purchase  → maal aaya (+ cost diya to weighted average cost update)
//      Wastage   → gira / expire / kharab (reason zaroori)
//      Count     → asli ginti → farq (variance) qty + ₹ mein turant dikhta hai save se pehle
//  - Edit: naam, alert level, cost. Unit locked. Remove (archive) — recipe mein laga ho to server mana karta hai.
//  - "Used in": kin menu items ki recipe mein hai (tap → recipe)
//  - History: har badlav — kisne, kab, kis order se, kitna, baad mein kitna bacha. "Load more" (cursor).
//  - Live: kisi phone pe bill / purchase ho → yahan khud refresh (useStockSignal)
// CONNECTED TO: inventory.api.ts, lib/units.ts, menu/recipe.tsx, components/ui/BottomSheet.tsx

import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft, Pencil, PackagePlus, Trash2, ClipboardCheck, ShoppingBag, Undo2, Settings2, Flag, ChevronRight,
  UtensilsCrossed,
} from 'lucide-react-native';
import { inventoryApi, InventoryItemDetail, MovementType, StockMovement } from '../../../features/inventory/inventory.api';
import { useStockSignal } from '../../../features/inventory/useStockSignal';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { getErrorMessage } from '../../../lib/api-client';
import { haptics } from '../../../lib/haptics';
import { formatINR } from '../../../lib/format';
import { formatQty, formatNumber, parseQty, cleanQtyInput, round3 } from '../../../lib/units';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { TextField } from '../../../components/ui/TextField';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { PressScale } from '../../../components/ui/PressScale';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/StateViews';
import { theme } from '../../../theme';
import { ui } from '../../../theme/ui';

type Sheet = 'purchase' | 'wastage' | 'count' | 'edit' | null;
const NUM = { fontVariant: ['tabular-nums' as const] };
const WASTE_REASONS = ['Spilled', 'Expired', 'Spoiled', 'Burnt', 'Staff meal'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function when(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const time = `${h % 12 === 0 ? 12 : h % 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return `Today, ${time}`;
  if (same(d, y)) return `Yesterday, ${time}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

const MOVE_META: Record<MovementType, { icon: React.ComponentType<{ size: number; color: string }>; label: string }> = {
  OPENING: { icon: Flag, label: 'Opening stock' },
  PURCHASE: { icon: PackagePlus, label: 'Purchase' },
  SALE: { icon: ShoppingBag, label: 'Sold' },
  SALE_REVERSAL: { icon: Undo2, label: 'Order cancelled, returned' },
  WASTAGE: { icon: Trash2, label: 'Wastage' },
  COUNT: { icon: ClipboardCheck, label: 'Stock count' },
  ADJUSTMENT: { icon: Settings2, label: 'Manual change' },
};

export default function InventoryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<InventoryItemDetail | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [sheet, setSheet] = useState<Sheet>(null);
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const [alertAt, setAlertAt] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { loading, refreshing, error, refresh, retry, reload } = useScreenLoad(async () => {
    const d = await inventoryApi.getItem(id);
    setData(d); // pehla page — "load more" wale purane pages refresh pe reset (sahi order)
  });
  useStockSignal(reload);

  const loadMore = useCallback(async () => {
    if (!data?.nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await inventoryApi.getItem(id, data.nextBefore);
      setData((cur) =>
        cur
          ? {
              ...cur,
              movements: [...cur.movements, ...more.movements.filter((m) => !cur.movements.some((c) => c.id === m.id))],
              nextBefore: more.nextBefore,
            }
          : cur
      );
    } catch (err) {
      Alert.alert('Could not load more', getErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [data, id, loadingMore]);

  const item = data?.item;

  const open = (s: Exclude<Sheet, null>) => {
    if (!item) return;
    haptics.tap();
    setSheetError(null);
    setQty('');
    setNote('');
    setCost('');
    if (s === 'edit') {
      setName(item.name);
      setAlertAt(item.lowStockAlertAt > 0 ? formatNumber(item.lowStockAlertAt).replace(/[,−]/g, '') : '');
      setCost((item.costPerUnit ?? 0) > 0 ? String(item.costPerUnit) : '');
    }
    setSheet(s);
  };

  const close = () => {
    if (!saving) setSheet(null);
  };

  const submit = async () => {
    if (!item || saving) return;
    setSheetError(null);
    const q = parseQty(qty);
    try {
      if (sheet === 'purchase') {
        if (q === null || q <= 0) return setSheetError('Enter how much came in');
        const c = cost.trim() ? parseQty(cost) : undefined;
        if (c === null || (c !== undefined && c < 0)) return setSheetError('Enter a valid cost');
        setSaving(true);
        await inventoryApi.purchase(item.id, { quantity: q, unitCost: c, note: note.trim() || undefined });
      } else if (sheet === 'wastage') {
        if (q === null || q <= 0) return setSheetError('Enter how much was wasted');
        if (note.trim().length < 2) return setSheetError('Pick or write a reason');
        setSaving(true);
        await inventoryApi.wastage(item.id, { quantity: q, note: note.trim() });
      } else if (sheet === 'count') {
        if (q === null || q < 0) return setSheetError('Enter the quantity you counted');
        setSaving(true);
        await inventoryApi.createCount({ items: [{ inventoryItemId: item.id, actualQuantity: q }] });
      } else if (sheet === 'edit') {
        const a = alertAt.trim() ? parseQty(alertAt) : 0;
        const c = cost.trim() ? parseQty(cost) : 0;
        if (name.trim().length < 2) return setSheetError('Name is too short');
        if (a === null || a < 0) return setSheetError('Enter a valid alert level');
        if (c === null || c < 0) return setSheetError('Enter a valid cost');
        setSaving(true);
        await inventoryApi.updateItem(item.id, { name: name.trim(), lowStockAlertAt: a, costPerUnit: c });
      }
      haptics.success();
      setSheet(null);
      reload();
    } catch (err) {
      haptics.error();
      setSheetError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = () => {
    if (!item) return;
    Alert.alert(`Remove ${item.name}?`, 'It will disappear from your stock list. Its history stays in reports.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await inventoryApi.archiveItem(item.id);
            haptics.success();
            setSheet(null);
            router.back();
          } catch (err) {
            haptics.error();
            setSheetError(getErrorMessage(err));
          }
        },
      },
    ]);
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="" onBack={() => router.back()} />
        <View style={styles.content}>
          <Skeleton height={150} radius={theme.radius.lg} />
          <Skeleton height={56} radius={theme.radius.md} />
          <Skeleton height={260} radius={theme.radius.lg} />
        </View>
      </SafeAreaView>
    );
  }
  if (!item) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Stock item" onBack={() => router.back()} />
        <ErrorState message={error ?? 'This stock item was not found.'} onRetry={retry} />
      </SafeAreaView>
    );
  }

  const out = item.quantity <= 0;
  const low = !out && item.quantity <= item.lowStockAlertAt;
  const tone = out ? theme.colors.danger : low ? theme.colors.warning : theme.colors.textPrimary;

  // Sheet preview: save se pehle saaf dikhe kya hoga
  const q = parseQty(qty);
  let preview: { text: string; color: string } | null = null;
  if (q !== null && q >= 0 && sheet === 'purchase' && q > 0) {
    preview = { text: `Stock after: ${formatQty(round3(item.quantity + q), item.unit)}`, color: theme.colors.textSecondary };
  } else if (q !== null && q > 0 && sheet === 'wastage') {
    const after = round3(item.quantity - q);
    const value = q * (item.costPerUnit ?? 0);
    preview = {
      text: `Stock after: ${formatQty(after, item.unit)}${value > 0 ? ` · ${formatINR(value)} lost` : ''}`,
      color: after < 0 ? theme.colors.danger : theme.colors.textSecondary,
    };
  } else if (q !== null && q >= 0 && sheet === 'count') {
    const diff = round3(q - item.quantity);
    const value = Math.abs(diff) * (item.costPerUnit ?? 0);
    preview =
      diff === 0
        ? { text: 'Matches the system. Nothing missing.', color: theme.colors.success }
        : diff < 0
          ? { text: `${formatQty(Math.abs(diff), item.unit)} missing${value > 0 ? ` · ${formatINR(value)}` : ''}`, color: theme.colors.danger }
          : { text: `${formatQty(diff, item.unit)} more than the system${value > 0 ? ` · ${formatINR(value)}` : ''}`, color: theme.colors.success };
  }

  const sheetTitle =
    sheet === 'purchase' ? `Add purchase` : sheet === 'wastage' ? 'Record wastage' : sheet === 'count' ? `Count ${item.name}` : 'Edit item';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header
        title={item.name}
        onBack={() => router.back()}
        right={
          <Pressable style={styles.iconBtn} onPress={() => open('edit')} hitSlop={6} accessibilityLabel="Edit item">
            <Pencil size={17} color={theme.colors.textPrimary} />
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
      >
        {/* ── Now ── */}
        <View style={styles.card}>
          <View style={styles.nowTop}>
            <Text style={styles.nowLabel}>In stock now</Text>
            {(out || low) && (
              <View style={[styles.pill, { backgroundColor: out ? theme.colors.dangerLight : theme.colors.warningLight }]}>
                <Text style={[styles.pillText, { color: tone }]}>{out ? 'Out of stock' : 'Running low'}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.nowValue, { color: tone }]} accessibilityLabel={`${formatQty(item.quantity, item.unit)} in stock`}>
            {formatQty(item.quantity, item.unit)}
          </Text>
          {item.quantity < 0 && (
            <Text style={styles.negHint}>Below zero means more was used than recorded. Do a count to fix it.</Text>
          )}
          <View style={styles.factsRow}>
            <Fact label="Value" value={(item.costPerUnit ?? 0) > 0 ? formatINR(item.stockValue ?? 0) : '—'} />
            <Fact label={`Cost per ${item.unit}`} value={(item.costPerUnit ?? 0) > 0 ? formatINR(item.costPerUnit!) : 'Not set'} />
            <Fact label="Alert at" value={item.lowStockAlertAt > 0 ? formatQty(item.lowStockAlertAt, item.unit) : 'Not set'} />
          </View>
        </View>

        {/* ── Actions ── */}
        <View style={styles.actionsRow}>
          <ActionBtn icon={PackagePlus} label="Purchase" onPress={() => open('purchase')} />
          <ActionBtn icon={Trash2} label="Wastage" onPress={() => open('wastage')} />
          <ActionBtn icon={ClipboardCheck} label="Count" onPress={() => open('count')} />
        </View>

        {/* ── Used in ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Used in</Text>
          {data!.usedIn.length === 0 ? (
            <Text style={styles.emptyText}>Not in any recipe yet. Open a menu item and add a recipe so this goes down by itself with every bill.</Text>
          ) : (
            data!.usedIn.map((u, i) => (
              <Pressable
                key={`${u.productId}-${u.variantName ?? ''}`}
                style={({ pressed }) => [styles.usedRow, i > 0 && styles.rowBorder, pressed && styles.rowPressed]}
                onPress={() => router.push({ pathname: '/(admin)/menu/recipe', params: { productId: u.productId } })}
                accessibilityLabel={`${u.productName}${u.variantName ? ` ${u.variantName}` : ''} uses ${formatQty(u.quantity, u.unit)}. Open recipe`}
              >
                <UtensilsCrossed size={16} color={theme.colors.textSecondary} />
                <Text style={styles.usedName} numberOfLines={1}>
                  {u.productName}
                  {u.variantName ? <Text style={styles.usedSize}> · {u.variantName}</Text> : null}
                </Text>
                <Text style={styles.usedQty}>{formatQty(u.quantity, u.unit)}</Text>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </Pressable>
            ))
          )}
        </View>

        {/* ── History ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>History</Text>
          {data!.movements.length === 0 ? (
            <Text style={styles.emptyText}>No changes yet.</Text>
          ) : (
            data!.movements.map((m, i) => <MoveRow key={m.id} m={m} unit={item.unit} first={i === 0} />)
          )}
          {data!.nextBefore && (
            <Pressable style={styles.moreBtn} onPress={loadMore} disabled={loadingMore} accessibilityRole="button">
              {loadingMore ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={styles.moreText}>Show older</Text>}
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* ── Sheets ── */}
      <BottomSheet visible={sheet !== null} onClose={close} title={sheetTitle}>
        {sheetError && <ErrorBanner message={sheetError} />}

        {sheet === 'edit' ? (
          <>
            <TextField label="Name" value={name} onChangeText={setName} maxLength={60} />
            <TextField
              label={`Alert me below (${item.unit})`}
              placeholder="e.g. 5"
              keyboardType="decimal-pad"
              value={alertAt}
              onChangeText={(v) => setAlertAt(cleanQtyInput(v))}
            />
            <TextField
              label={`Cost per ${item.unit} (₹)`}
              placeholder="e.g. 60"
              keyboardType="decimal-pad"
              value={cost}
              onChangeText={(v) => setCost(cleanQtyInput(v, 2))}
            />
            <Text style={styles.sheetHint}>Unit ({item.unit}) can't be changed because recipes and history use it.</Text>
            <Button title="Save" onPress={submit} loading={saving} />
            <Pressable style={styles.removeBtn} onPress={confirmRemove} accessibilityRole="button">
              <Text style={styles.removeText}>Remove item</Text>
            </Pressable>
          </>
        ) : (
          <>
            {sheet === 'count' && (
              <Text style={styles.sheetLead}>
                System says {formatQty(item.quantity, item.unit)}. Count what is really there and enter it.
              </Text>
            )}
            <TextField
              label={sheet === 'purchase' ? `Quantity bought (${item.unit})` : sheet === 'wastage' ? `Quantity wasted (${item.unit})` : `Counted quantity (${item.unit})`}
              placeholder="e.g. 5"
              keyboardType="decimal-pad"
              value={qty}
              onChangeText={(v) => { setQty(cleanQtyInput(v)); if (sheetError) setSheetError(null); }}
              autoFocus
            />
            {sheet === 'purchase' && (
              <>
                <TextField
                  label={`Price per ${item.unit} (₹, optional)`}
                  placeholder={(item.costPerUnit ?? 0) > 0 ? `Last: ${formatINR(item.costPerUnit!)}` : 'e.g. 60'}
                  keyboardType="decimal-pad"
                  value={cost}
                  onChangeText={(v) => setCost(cleanQtyInput(v, 2))}
                />
                <TextField label="Supplier or note (optional)" placeholder="e.g. Amul, bill #234" value={note} onChangeText={setNote} maxLength={200} />
              </>
            )}
            {sheet === 'wastage' && (
              <>
                <Text style={styles.reasonLabel}>Reason</Text>
                <View style={styles.reasonRow}>
                  {WASTE_REASONS.map((r) => {
                    const active = note === r;
                    return (
                      <Pressable
                        key={r}
                        style={[styles.reasonChip, active && styles.reasonChipActive]}
                        onPress={() => { haptics.tap(); setNote(active ? '' : r); if (sheetError) setSheetError(null); }}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                      >
                        <Text style={[styles.reasonText, active && styles.reasonTextActive]}>{r}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <TextField
                  label="Or write a reason"
                  placeholder="e.g. Milk went sour"
                  value={WASTE_REASONS.includes(note) ? '' : note}
                  onChangeText={(v) => { setNote(v); if (sheetError) setSheetError(null); }}
                  maxLength={200}
                />
              </>
            )}
            {preview && <Text style={[styles.preview, { color: preview.color }]}>{preview.text}</Text>}
            <Button
              title={sheet === 'purchase' ? 'Add purchase' : sheet === 'wastage' ? 'Record wastage' : 'Save count'}
              onPress={submit}
              loading={saving}
            />
          </>
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function Header({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
        <ArrowLeft size={19} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      {right ?? <View style={{ width: 40 }} />}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.factLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ActionBtn({ icon: Icon, label, onPress }: { icon: React.ComponentType<{ size: number; color: string }>; label: string; onPress: () => void }) {
  return (
    <PressScale style={styles.actionBtn} onPress={onPress} accessibilityLabel={label}>
      <Icon size={18} color={theme.colors.primary} />
      <Text style={styles.actionText}>{label}</Text>
    </PressScale>
  );
}

function MoveRow({ m, unit, first }: { m: StockMovement; unit: string; first: boolean }) {
  const meta = MOVE_META[m.type];
  const Icon = meta.icon;
  let title = meta.label;
  if (m.type === 'SALE' && m.orderNumber !== null) title = `Sold · order #${m.orderNumber}`;
  if (m.type === 'SALE_REVERSAL' && m.orderNumber !== null) title = `Order #${m.orderNumber} cancelled, returned`;
  if (m.type === 'WASTAGE' && m.orderNumber !== null) title = `Order #${m.orderNumber} cancelled, food made`;
  const color = m.quantity > 0 ? theme.colors.success : m.type === 'WASTAGE' || (m.type === 'COUNT' && m.quantity < 0) ? theme.colors.danger : theme.colors.textPrimary;
  const detail = [m.by ?? (m.type === 'SALE' ? 'QR order' : null), when(m.createdAt)].filter(Boolean).join(' · ');
  const note = m.type === 'WASTAGE' && m.orderNumber !== null ? null : m.note;
  return (
    <View style={[styles.moveRow, !first && styles.rowBorder]}>
      <View style={styles.moveIcon}>
        <Icon size={15} color={theme.colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.moveTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.moveSub} numberOfLines={1}>{detail}</Text>
        {!!note && <Text style={styles.moveNote} numberOfLines={2}>{note}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.moveQty, { color }]}>
          {m.quantity > 0 ? '+' : ''}
          {formatQty(m.quantity, unit)}
        </Text>
        <Text style={styles.moveBal}>{formatQty(m.balanceAfter, unit)} left</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar, gap: theme.spacing.md },
  headerTitle: { ...ui.headerTitle, flex: 1, textAlign: 'center' },
  iconBtn: { ...ui.iconButton },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  card: { ...ui.card, padding: theme.spacing.lg },
  cardTitle: { ...ui.sectionTitle, marginBottom: theme.spacing.sm },

  nowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nowLabel: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: theme.radius.full },
  pillText: { fontSize: 12, fontFamily: theme.typography.font.semibold },
  nowValue: { fontSize: 34, lineHeight: 42, fontFamily: theme.typography.font.semibold, marginTop: 4, ...NUM },
  negHint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.danger, marginTop: 2, lineHeight: 17 },
  factsRow: { flexDirection: 'row', gap: theme.spacing.md, marginTop: theme.spacing.md, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
  factLabel: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  factValue: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 2, ...NUM },

  actionsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  actionBtn: { ...ui.card, flex: 1, height: 64, justifyContent: 'center', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },

  emptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20 },
  usedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  rowPressed: { opacity: 0.7 },
  usedName: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  usedSize: { fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  usedQty: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, ...NUM },

  moveRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: 10 },
  moveIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  moveTitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, ...NUM },
  moveSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },
  moveNote: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: 2 },
  moveQty: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, ...NUM },
  moveBal: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: 2, ...NUM },
  moreBtn: { height: 44, justifyContent: 'center', alignItems: 'center', marginTop: theme.spacing.sm },
  moreText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },

  sheetLead: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginBottom: theme.spacing.md, lineHeight: 20 },
  sheetHint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginBottom: theme.spacing.md, lineHeight: 17 },
  reasonLabel: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  reasonChip: { height: 36, paddingHorizontal: 14, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center' },
  reasonChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  reasonText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  reasonTextActive: { color: theme.colors.white },
  preview: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, marginBottom: theme.spacing.md, ...NUM },
  removeBtn: { alignItems: 'center', paddingVertical: theme.spacing.md, marginTop: theme.spacing.sm },
  removeText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.danger },
});
