// app/(admin)/inventory/count-history.tsx
// ADDED (2026-10-09) — STOCK SOP: pichle stock counts (naya pehle). Har count: kab, kisne, kitne
// items, kitne ₹ ka maal gayab. Tap → poori detail (count-detail.tsx). Owner hafte bhar ka trend
// dekh sake — "har count pe ₹300 doodh gayab" = pattern, ek-baar ki galti nahi.
// CONNECTED TO: inventory.api.ts (getCounts), count-detail.tsx, count.tsx

import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ClipboardCheck, ChevronRight } from 'lucide-react-native';
import { inventoryApi, StockCountSummary } from '../../../features/inventory/inventory.api';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { formatINR, shortDateTime as formatCountDate } from '../../../lib/format';
import { PressScale } from '../../../components/ui/PressScale';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../../components/ui/StateViews';
import { theme } from '../../../theme';
import { ui } from '../../../theme/ui';

const NUM = { fontVariant: ['tabular-nums' as const] };

export default function CountHistoryScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState<StockCountSummary[]>([]);
  const { loading, refreshing, error, refresh, retry } = useScreenLoad(async () => {
    setCounts(await inventoryApi.getCounts());
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Past counts</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <SkeletonList count={5} />
      ) : error && counts.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={counts}
          keyExtractor={(c) => c.countId}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          renderItem={({ item }) => {
            const missing = Math.abs(item.missingValue);
            return (
              <PressScale
                style={styles.row}
                onPress={() => router.push({ pathname: '/(admin)/inventory/count-detail', params: { countId: item.countId } })}
                accessibilityLabel={`Count on ${formatCountDate(item.at)}. ${missing > 0 ? `${formatINR(missing)} missing` : 'Nothing missing'}`}
              >
                <View style={styles.icon}>
                  <ClipboardCheck size={18} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{formatCountDate(item.at)}</Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {item.itemsCounted} item{item.itemsCounted === 1 ? '' : 's'}
                    {item.by ? ` · ${item.by}` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.value, { color: missing > 0 ? theme.colors.danger : theme.colors.success }]}>
                    {missing > 0 ? `−${formatINR(missing)}` : item.itemsWithVariance > 0 ? `${item.itemsWithVariance} changed` : 'All matched'}
                  </Text>
                  {missing > 0 && <Text style={styles.valueSub}>missing</Text>}
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </PressScale>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon={ClipboardCheck}
              title="No counts yet"
              message="Count your stock at closing time. BillRaw shows what went missing, in ₹."
              actionLabel="Start a count"
              onAction={() => router.replace('/(admin)/inventory/count')}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  headerTitle: { ...ui.headerTitle },
  iconBtn: { ...ui.iconButton },
  list: { padding: theme.spacing.lg, gap: theme.spacing.sm, flexGrow: 1 },
  row: { ...ui.card, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, ...NUM },
  sub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },
  value: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, ...NUM },
  valueSub: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: 1 },
});
