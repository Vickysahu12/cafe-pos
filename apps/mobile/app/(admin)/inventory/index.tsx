// app/(admin)/inventory/index.tsx
// USE CASE: Inventory list — shows all stock items, low-stock ones highlighted. Quick
//           +/- buttons adjust quantity inline without opening a separate screen.
// CONNECTED TO: inventory.api.ts. Reached from Dashboard's low-stock alert banner.
//
// UI/UX PASS (2026-09-30): useScreenLoad (skeleton, error + retry, pull-to-refresh),
// low-stock items list mein sabse upar, aur +/- fail hone pe asli error dikhta hai
// (pehle chupchaap ignore hota tha — owner samajhta stock update ho gaya).
//
// REWRITE (2026-10-09) — STOCK SOP:
//  - +/- buttons hataye: andaaze se +1/−1 karna hi galat stock ki jad thi. Ab har badlav ka
//    naam hai — Purchase / Wastage / Count (item detail pe), aur bikri recipe se apne-aap.
//  - Upar: stock ki value (₹), Low aur Out ginti (tap = filter). Search + All/Low/Out chips.
//  - "Count" button → poore stock ki ginti (variance) — din/hafte ka SOP. 7 din se count nahi
//    hua to halka nudge.
//  - Live: kisi bhi phone pe bill / purchase / count → yeh list khud refresh (useStockSignal).
//  - Manager ke liye yeh TAB hai (back arrow nahi), Owner More se aata hai (back arrow).
// CONNECTED TO: inventory/[id].tsx, inventory/create.tsx, inventory/count.tsx, lib/units.ts

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Package, AlertTriangle, Search, X, ClipboardCheck, ChevronRight, CircleSlash } from 'lucide-react-native';
import { inventoryApi, InventoryItem } from '../../../features/inventory/inventory.api';
import { useStockSignal } from '../../../features/inventory/useStockSignal';
import { useAuthStore } from '../../../features/auth/auth.store';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { haptics } from '../../../lib/haptics';
import { formatINR } from '../../../lib/format';
import { formatQty } from '../../../lib/units';
import { PressScale } from '../../../components/ui/PressScale';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../../components/ui/StateViews';
import { theme } from '../../../theme';
import { ui } from '../../../theme/ui';

type Filter = 'all' | 'low' | 'out';

const NUM = { fontVariant: ['tabular-nums' as const] };

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default function InventoryScreen() {
  const router = useRouter();
  const isOwner = useAuthStore((s) => s.user?.role) === 'OWNER';
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const { loading, refreshing, error, refresh, retry, reload } = useScreenLoad(async () => {
    setItems(await inventoryApi.getItems());
  });
  useStockSignal(reload);

  const stats = useMemo(() => {
    const out = items.filter((i) => i.quantity <= 0).length;
    const low = items.filter((i) => i.quantity > 0 && i.quantity <= i.lowStockAlertAt).length;
    const value = items.reduce((s, i) => s + (i.stockValue ?? 0), 0);
    const hasCost = items.some((i) => (i.costPerUnit ?? 0) > 0);
    const lastCount = items.reduce<string | null>((best, i) => (i.lastCountedAt && (!best || i.lastCountedAt > best) ? i.lastCountedAt : best), null);
    return { out, low, value, hasCost, lastCountDays: daysAgo(lastCount), everCounted: !!lastCount };
  }, [items]);

  // Out → Low → baaki, phir naam se
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank = (i: InventoryItem) => (i.quantity <= 0 ? 0 : i.quantity <= i.lowStockAlertAt ? 1 : 2);
    return items
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true))
      .filter((i) => (filter === 'out' ? i.quantity <= 0 : filter === 'low' ? i.quantity > 0 && i.quantity <= i.lowStockAlertAt : true))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [items, search, filter]);

  const pickFilter = (f: Filter) => {
    haptics.tap();
    setFilter((cur) => (cur === f ? 'all' : f));
  };

  const showCountNudge = items.length > 0 && (!stats.everCounted || (stats.lastCountDays ?? 0) >= 7);

  const header = (
    <>
      {isOwner && (
        <View style={styles.headerBar}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton} accessibilityLabel="Back">
            <ArrowLeft size={19} color={theme.colors.textPrimary} />
          </Pressable>
        </View>
      )}
      <View style={[styles.titleBlock, isOwner && { paddingTop: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Stock</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {items.length} item{items.length === 1 ? '' : 's'}
            {stats.hasCost ? ` · ${formatINR(stats.value)} in stock` : ''}
          </Text>
        </View>
        <PressScale
          style={styles.countBtn}
          onPress={() => router.push('/(admin)/inventory/count')}
          disabled={items.length === 0}
          accessibilityLabel="Start a stock count"
        >
          <ClipboardCheck size={16} color={theme.colors.textPrimary} />
          <Text style={styles.countBtnText}>Count</Text>
        </PressScale>
      </View>
    </>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {header}
        <SkeletonList count={6} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {header}

      {error && items.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.md }}>
                {/* Summary — Low / Out tap = filter */}
                <View style={styles.statsRow}>
                  <PressScale
                    style={[styles.stat, filter === 'low' && styles.statActive, stats.low > 0 && styles.statWarn]}
                    onPress={() => pickFilter('low')}
                    accessibilityLabel={`${stats.low} items running low. ${filter === 'low' ? 'Showing only these' : 'Show only these'}`}
                  >
                    <Text style={[styles.statValue, stats.low > 0 && { color: theme.colors.warning }]}>{stats.low}</Text>
                    <Text style={styles.statLabel}>Running low</Text>
                  </PressScale>
                  <PressScale
                    style={[styles.stat, filter === 'out' && styles.statActive, stats.out > 0 && styles.statDanger]}
                    onPress={() => pickFilter('out')}
                    accessibilityLabel={`${stats.out} items out of stock. ${filter === 'out' ? 'Showing only these' : 'Show only these'}`}
                  >
                    <Text style={[styles.statValue, stats.out > 0 && { color: theme.colors.danger }]}>{stats.out}</Text>
                    <Text style={styles.statLabel}>Out of stock</Text>
                  </PressScale>
                </View>

                {showCountNudge && (
                  <PressScale style={styles.nudge} onPress={() => router.push('/(admin)/inventory/count')} accessibilityLabel="Start a stock count">
                    <ClipboardCheck size={18} color={theme.colors.accentInk} />
                    <Text style={styles.nudgeText}>
                      {stats.everCounted
                        ? `Last stock count was ${stats.lastCountDays} days ago. Count now to catch waste and missing stock.`
                        : 'Do your first stock count. It shows what went missing, in ₹.'}
                    </Text>
                    <ChevronRight size={16} color={theme.colors.textMuted} />
                  </PressScale>
                )}

                <View style={styles.searchBar}>
                  <Search size={17} color={theme.colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search stock"
                    placeholderTextColor={theme.colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                    returnKeyType="search"
                    selectionColor={theme.colors.accent}
                    cursorColor={theme.colors.accent}
                  />
                  {search.length > 0 && (
                    <Pressable onPress={() => setSearch('')} hitSlop={10} accessibilityLabel="Clear search">
                      <X size={16} color={theme.colors.textMuted} />
                    </Pressable>
                  )}
                </View>

                {filter !== 'all' && (
                  <View style={styles.filterRow}>
                    <Text style={styles.filterText}>Showing {filter === 'low' ? 'items running low' : 'items out of stock'}</Text>
                    <Pressable onPress={() => pickFilter(filter)} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.filterClear}>Show all</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const out = item.quantity <= 0;
            const low = !out && item.quantity <= item.lowStockAlertAt;
            const tone = out ? theme.colors.danger : low ? theme.colors.warning : theme.colors.textPrimary;
            const meta: string[] = [];
            if ((item.recipeCount ?? 0) > 0) meta.push(`In ${item.recipeCount} recipe${item.recipeCount === 1 ? '' : 's'}`);
            if ((item.costPerUnit ?? 0) > 0) meta.push(`${formatINR(item.costPerUnit!)}/${item.unit}`);
            if (meta.length === 0) meta.push(item.lowStockAlertAt > 0 ? `Alert at ${formatQty(item.lowStockAlertAt, item.unit)}` : 'No alert level set');
            return (
              <PressScale
                style={styles.itemCard}
                onPress={() => router.push({ pathname: '/(admin)/inventory/[id]', params: { id: item.id } })}
                accessibilityLabel={`${item.name}, ${formatQty(item.quantity, item.unit)}${out ? ', out of stock' : low ? ', running low' : ''}`}
              >
                <View style={[styles.iconBox, out ? { backgroundColor: theme.colors.dangerLight } : low ? { backgroundColor: theme.colors.warningLight } : null]}>
                  {out ? (
                    <CircleSlash size={18} color={theme.colors.danger} />
                  ) : low ? (
                    <AlertTriangle size={18} color={theme.colors.warning} />
                  ) : (
                    <Package size={18} color={theme.colors.primary} />
                  )}
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>{meta.join(' · ')}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.itemQty, { color: tone }]}>{formatQty(item.quantity, item.unit)}</Text>
                  {(out || low) && <Text style={[styles.itemStatus, { color: tone }]}>{out ? 'Out of stock' : 'Running low'}</Text>}
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </PressScale>
            );
          }}
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState
                icon={Package}
                title="Track your stock"
                message="Add what you buy, like milk, coffee beans and cups. Then add recipes to menu items, and stock goes down by itself with every bill."
                actionLabel="Add first item"
                onAction={() => router.push('/(admin)/inventory/create')}
              />
            ) : (
              <Text style={styles.noMatch}>
                {search.trim() ? `No stock item matches "${search.trim()}".` : filter === 'out' ? 'Nothing is out of stock.' : 'Nothing is running low.'}
              </Text>
            )
          }
        />
      )}

      {items.length > 0 && (
        <View style={styles.footer}>
          <Pressable style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.9 }]} onPress={() => router.push('/(admin)/inventory/create')}>
            <Plus size={18} color={theme.colors.white} />
            <Text style={styles.addButtonText}>Add item</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  headerBar: { ...ui.headerBar, justifyContent: 'flex-start' },
  backButton: { ...ui.iconButton },
  titleBlock: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary },
  subtitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4, ...NUM },
  countBtn: { ...ui.iconButton, width: undefined, flexDirection: 'row', gap: 6, paddingHorizontal: 14 },
  countBtnText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },

  listContent: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: theme.spacing.sm, flexGrow: 1 },

  statsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: { ...ui.card, flex: 1, paddingVertical: 12, paddingHorizontal: 14 },
  statActive: { borderColor: theme.colors.primary, borderWidth: 2, paddingVertical: 11, paddingHorizontal: 13 },
  statWarn: { backgroundColor: theme.colors.warningLight, borderColor: 'transparent' },
  statDanger: { backgroundColor: theme.colors.dangerLight, borderColor: 'transparent' },
  statValue: { fontSize: 22, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, ...NUM },
  statLabel: { fontSize: 12, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginTop: 2 },

  nudge: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.primaryLight },
  nudgeText: { flex: 1, fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary, lineHeight: 18 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.colors.surface, borderWidth: 1,
    borderColor: theme.colors.border, borderRadius: theme.radius.md, paddingHorizontal: 12, height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterText: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  filterClear: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },

  itemCard: { ...ui.card, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md },
  iconBox: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  itemTextWrap: { flex: 1 },
  itemName: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  itemMeta: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },
  itemQty: { fontSize: 15, fontFamily: theme.typography.font.semibold, ...NUM },
  itemStatus: { fontSize: 11, fontFamily: theme.typography.font.semibold, marginTop: 2 },
  noMatch: { textAlign: 'center', marginTop: theme.spacing.xl, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },

  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.background },
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold },
});
