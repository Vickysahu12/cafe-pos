// app/(admin)/inventory/count.tsx
// ADDED (2026-10-09) — STOCK SOP: STOCK COUNT (din ke end / hafte mein ek baar).
// Manager har item ki asli ginti daalta hai → system se farq (variance) qty + ₹ mein. Yahi
// "chori / galat portion / bina-bill khana" pakadne ka tarika hai (Petpooja ka "variance report").
//  - Har row: system kitna kehta hai + input. Bharte hi neeche farq dikhta hai (save se pehle).
//  - Jitne items gine utne hi update (baaki chhodo — aadha count bhi chalega, confirm poochte hain)
//  - Count ke beech bill hote rahein to bhi sahi: server save ke pal ka stock lock karke farq nikalta hai
//  - Aadha bhara count chhod ke jaane pe "Discard?" (back button + Android back dono)
//  - Save → nateeja (CountResult): kitne ₹ ka maal gayab, kaunsa item. Pichle counts: count-history
// CONNECTED TO: inventory.api.ts (createCount), components/inventory/CountResult.tsx, lib/units.ts

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowLeft, Search, X, History } from 'lucide-react-native';
import { inventoryApi, InventoryItem, StockCountResult } from '../../../features/inventory/inventory.api';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { getErrorMessage } from '../../../lib/api-client';
import { haptics } from '../../../lib/haptics';
import { formatINR } from '../../../lib/format';
import { formatQty, parseQty, cleanQtyInput, round3 } from '../../../lib/units';
import { Button } from '../../../components/ui/Button';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/StateViews';
import { CountResult } from '../../../components/inventory/CountResult';
import { theme } from '../../../theme';
import { ui } from '../../../theme/ui';

const NUM = { fontVariant: ['tabular-nums' as const] };

export default function StockCountScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<StockCountResult | null>(null);

  // Count ke beech list refresh NAHI (focus pe bhi) — rows hil jaayein to galat box mein number chala jaata
  const loadedOnce = useRef(false);
  const { loading, error, retry } = useScreenLoad(async () => {
    if (loadedOnce.current) return;
    setItems(await inventoryApi.getItems());
    loadedOnce.current = true;
  });

  const entered = useMemo(
    () =>
      items
        .map((i) => ({ item: i, value: counts[i.id] !== undefined ? parseQty(counts[i.id]) : null }))
        .filter((e): e is { item: InventoryItem; value: number } => e.value !== null && e.value >= 0),
    [items, counts]
  );

  const totals = useMemo(() => {
    let missing = 0;
    let extra = 0;
    for (const e of entered) {
      const v = (e.value - e.item.quantity) * (e.item.costPerUnit ?? 0);
      if (v < 0) missing += -v;
      else extra += v;
    }
    return { missing, extra };
  }, [entered]);

  // Aadha count chhod ke jaane pe confirm (save ke baad nahi)
  const dirty = entered.length > 0 && !result;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Discard this count?', `You entered ${entered.length} item${entered.length === 1 ? '' : 's'}. They won't be saved.`, [
        { text: 'Keep counting', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
    return unsub;
  }, [navigation, entered.length]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [items, search]);

  const save = async () => {
    if (saving || entered.length === 0) return;
    const doSave = async () => {
      setSaving(true);
      try {
        const res = await inventoryApi.createCount({
          items: entered.map((e) => ({ inventoryItemId: e.item.id, actualQuantity: round3(e.value) })),
        });
        haptics.success();
        setResult(res);
      } catch (err) {
        haptics.error();
        Alert.alert('Count not saved', getErrorMessage(err));
      } finally {
        setSaving(false);
      }
    };
    if (entered.length < items.length) {
      Alert.alert(
        `Save ${entered.length} of ${items.length} items?`,
        'Only the items you counted will be updated. The rest stay as they are.',
        [
          { text: 'Keep counting', style: 'cancel' },
          { text: 'Save', onPress: doSave },
        ]
      );
    } else {
      doSave();
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
        <ArrowLeft size={19} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>{result ? 'Count saved' : 'Stock count'}</Text>
      <Pressable
        onPress={() => router.push('/(admin)/inventory/count-history')}
        hitSlop={6}
        style={styles.iconBtn}
        accessibilityLabel="Past stock counts"
      >
        <History size={18} color={theme.colors.textPrimary} />
      </Pressable>
    </View>
  );

  if (result) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {header}
        <FlatList
          data={[]}
          renderItem={null}
          contentContainerStyle={styles.resultContent}
          ListHeaderComponent={<CountResult result={result} />}
        />
        <View style={styles.footer}>
          <Button title="Done" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {header}
      {loading ? (
        <SkeletonList count={6} />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <FlatList
            data={visible}
            keyExtractor={(i) => i.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.sm }}>
                <Text style={styles.lead}>
                  Count what is really on the shelf and type it in. Leave an item empty to skip it. Bills made while you count are handled automatically.
                </Text>
                <View style={styles.searchBar}>
                  <Search size={17} color={theme.colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search stock"
                    placeholderTextColor={theme.colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    selectionColor={theme.colors.accent}
                    cursorColor={theme.colors.accent}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                      <X size={16} color={theme.colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              </View>
            }
            renderItem={({ item }) => {
              const raw = counts[item.id] ?? '';
              const v = raw ? parseQty(raw) : null;
              const diff = v !== null ? round3(v - item.quantity) : null;
              const value = diff !== null ? Math.abs(diff) * (item.costPerUnit ?? 0) : 0;
              return (
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.system}>System: {formatQty(item.quantity, item.unit)}</Text>
                    {diff !== null && (
                      <Text
                        style={[
                          styles.diff,
                          { color: diff === 0 ? theme.colors.success : diff < 0 ? theme.colors.danger : theme.colors.success },
                        ]}
                      >
                        {diff === 0
                          ? 'Matches'
                          : `${diff < 0 ? '' : '+'}${formatQty(diff, item.unit)}${value > 0 ? ` · ${diff < 0 ? '−' : '+'}${formatINR(value)}` : ''}`}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.inputWrap, raw !== '' && styles.inputWrapFilled]}>
                    <TextInput
                      style={styles.input}
                      value={raw}
                      onChangeText={(t) => setCounts((c) => ({ ...c, [item.id]: cleanQtyInput(t) }))}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor={theme.colors.textMuted}
                      selectionColor={theme.colors.accent}
                      cursorColor={theme.colors.accent}
                      accessibilityLabel={`Counted quantity of ${item.name} in ${item.unit}`}
                      returnKeyType="done"
                    />
                    <Text style={styles.unit}>{item.unit}</Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={styles.empty}>{items.length === 0 ? 'Add stock items first.' : 'No stock item matches your search.'}</Text>}
          />

          <View style={styles.footer}>
            <View style={styles.footerSummary}>
              <Text style={styles.footerCount}>
                {entered.length} of {items.length} counted
              </Text>
              {(totals.missing > 0 || totals.extra > 0) && (
                <Text style={styles.footerMoney}>
                  {totals.missing > 0 ? <Text style={{ color: theme.colors.danger }}>{formatINR(totals.missing)} missing</Text> : null}
                  {totals.missing > 0 && totals.extra > 0 ? ' · ' : ''}
                  {totals.extra > 0 ? <Text style={{ color: theme.colors.success }}>{formatINR(totals.extra)} extra</Text> : null}
                </Text>
              )}
            </View>
            <Button title="Save count" onPress={save} loading={saving} disabled={entered.length === 0} />
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  headerTitle: { ...ui.headerTitle },
  iconBtn: { ...ui.iconButton },
  lead: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 19 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1,
    borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, gap: theme.spacing.sm },
  resultContent: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xl },
  row: { ...ui.card, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md },
  name: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  system: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },
  diff: { fontSize: 12, fontFamily: theme.typography.font.semibold, marginTop: 2, ...NUM },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', width: 116, height: 44, borderWidth: 1, borderColor: theme.colors.border,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.background, paddingHorizontal: 10,
  },
  inputWrapFilled: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
  input: { flex: 1, fontSize: 16, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, textAlign: 'right', paddingVertical: 0, ...NUM },
  unit: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginLeft: 6 },
  empty: { textAlign: 'center', marginTop: theme.spacing.xl, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing.sm },
  footerSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: theme.spacing.sm },
  footerCount: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, ...NUM },
  footerMoney: { fontSize: 13, fontFamily: theme.typography.font.semibold, ...NUM },
});
