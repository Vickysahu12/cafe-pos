// app/(admin)/sales-report.tsx
// USE CASE (2026-09-30): Owner ka Sales Report — Dashboard pe "Net Revenue" tap karke khulta
// hai. 7 / 30 din ka daily revenue graph (bar tap = us din ka ₹ + orders), pichle period se
// comparison, aaj ke busiest hours, payment split aur top items. Demo mein owner ko
// "yeh raha aapka business, ek nazar mein" dikhane ke liye — onboarding ka strong point.
//
// Numbers backend se (analytics.service.ts getSalesReport) — daily-summary jaisi definitions:
// revenue = paid + non-cancelled orders, orders = non-cancelled.
// CONNECTED TO: analytics.api.ts, components/charts/BarChart.tsx, lib/format.ts, dashboard.tsx.

import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, BarChart3, ShieldAlert } from 'lucide-react-native';
import { analyticsApi, SalesReport, HourlyPoint } from '../../features/analytics/analytics.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { useScreenLoad } from '../../lib/use-screen-load';
import { haptics } from '../../lib/haptics';
import { formatINR, formatINRCompact, weekdayShort, dayMonth, fullDay, hourLabel } from '../../lib/format';
import { BarChart } from '../../components/charts/BarChart';
import { Skeleton, SkeletonStatCard } from '../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { theme } from '../../theme';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
type Range = 7 | 30;

/** Pichle period se % change. null = comparison ka matlab nahi (pichla 0) */
function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ current, previous, range }: { current: number; previous: number; range: Range }) {
  const pct = percentChange(current, previous);
  const period = range === 7 ? 'last week' : 'previous 30 days';
  if (pct === null) {
    return <Text style={styles.deltaMuted}>{current > 0 ? `No data for ${period}` : '—'}</Text>;
  }
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat ? theme.colors.textSecondary : up ? theme.colors.success : theme.colors.danger;
  return (
    <View style={styles.deltaRow}>
      <Icon size={13} color={color} />
      <Text style={[styles.deltaText, { color }]}>
        {flat ? 'Same as' : `${up ? '+' : ''}${pct}% vs`} {period}
      </Text>
    </View>
  );
}

export default function SalesReportScreen() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const [range, setRange] = useState<Range>(7);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const { loading, refreshing, error, refresh, retry, reload } = useScreenLoad(async () => {
    if (role !== 'OWNER') return;
    const [r, h] = await Promise.all([analyticsApi.getSalesReport(range), analyticsApi.getHourlySales()]);
    setReport(r);
    setHourly(h);
    // Default: aaj (aakhri bar) chuna hua, taaki upar turant aaj ka number dikhe
    setSelectedDay(r.series.length - 1);
    setSelectedHour(null);
  });

  const changeRange = (next: Range) => {
    if (next === range) return;
    haptics.tap();
    setRange(next);
    setReport(null); // naye range ka skeleton, purana graph galat labels ke saath na dikhe
  };

  // Range badla → naye range ke saath reload (render ke BAAD, jab loadFn mein naya range ho).
  // Pehli baar skip — useScreenLoad khud focus pe load karta hai.
  const isFirstRange = useRef(true);
  useEffect(() => {
    if (isFirstRange.current) {
      isFirstRange.current = false;
      return;
    }
    reload();
  }, [range, reload]);

  const dayBars = useMemo(
    () =>
      (report?.series ?? []).map((d) => ({
        key: d.date,
        value: d.revenue,
        label: range === 7 ? weekdayShort(d.date) : dayMonth(d.date).split(' ')[0],
        a11yLabel: `${fullDay(d.date)}: ${formatINR(d.revenue)}, ${d.orders} orders`,
      })),
    [report, range]
  );

  // Hourly: sirf woh ghante jahan cafe khula laga (pehle se aakhri order tak), min 9AM–10PM
  const hourBars = useMemo(() => {
    const active = hourly.filter((h) => h.orderCount > 0).map((h) => h.hour);
    const from = Math.min(9, ...(active.length ? active : [9]));
    const to = Math.max(22, ...(active.length ? active : [22]));
    return hourly
      .filter((h) => h.hour >= from && h.hour <= to)
      .map((h) => ({
        key: String(h.hour),
        value: h.revenue,
        label: hourLabel(h.hour).replace(' ', '').toLowerCase(),
        a11yLabel: `${hourLabel(h.hour)}: ${formatINR(h.revenue)}, ${h.orderCount} orders`,
      }));
  }, [hourly]);
  const hourlyHasData = hourly.some((h) => h.orderCount > 0);
  const peakHour = hourly.reduce<HourlyPoint | null>((best, h) => (h.revenue > (best?.revenue ?? 0) ? h : best), null);

  // Owner-only (backend bhi 403 deta hai) — Manager galti se deep-link se aaye to
  if (role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header onBack={() => router.back()} />
        <EmptyState icon={ShieldAlert} title="Owner only" message="Sales reports are visible to the cafe Owner." />
      </SafeAreaView>
    );
  }

  const selected = report && selectedDay !== null ? report.series[selectedDay] : null;
  const selectedHourPoint = selectedHour !== null ? hourBars[selectedHour] : null;
  const split = report?.paymentSplit;
  const splitRows = split
    ? [
        { label: 'Cash', value: split.cash },
        { label: 'UPI', value: split.upi },
        { label: 'Card', value: split.card },
        ...(split.other > 0 ? [{ label: 'Other', value: split.other }] : []),
      ].sort((a, b) => b.value - a.value)
    : [];
  const splitMax = Math.max(1, ...splitRows.map((r) => r.value));
  const topMax = Math.max(1, ...(report?.topItems ?? []).map((t) => t.quantity));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header onBack={() => router.back()} />

      {/* Range toggle */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment} accessibilityRole="tablist">
          {([7, 30] as Range[]).map((r) => {
            const active = range === r;
            return (
              <Pressable
                key={r}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => changeRange(r)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {r === 7 ? 'Last 7 days' : 'Last 30 days'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading || !report ? (
        error && !report && !loading ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <View style={styles.content}>
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <SkeletonStatCard style={{ flex: 1 }} />
              <SkeletonStatCard style={{ flex: 1 }} />
            </View>
            <Skeleton height={280} radius={theme.radius.lg} style={{ marginTop: theme.spacing.md }} />
            <Skeleton height={160} radius={theme.radius.lg} style={{ marginTop: theme.spacing.md }} />
          </View>
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
        >
          {/* KPIs */}
          <View style={styles.kpiRow}>
            <View style={[styles.card, styles.kpiWide]}>
              <Text style={styles.kpiLabel}>Revenue</Text>
              <Text style={styles.kpiValueLarge}>{formatINR(report.totals.revenue)}</Text>
              <Delta current={report.totals.revenue} previous={report.previous.revenue} range={range} />
            </View>
          </View>
          <View style={styles.kpiRow}>
            <View style={[styles.card, styles.kpiHalf]}>
              <Text style={styles.kpiLabel}>Orders</Text>
              <Text style={styles.kpiValue}>{report.totals.orders}</Text>
              <Delta current={report.totals.orders} previous={report.previous.orders} range={range} />
            </View>
            <View style={[styles.card, styles.kpiHalf]}>
              <Text style={styles.kpiLabel}>Avg. bill</Text>
              <Text style={styles.kpiValue}>{formatINR(report.totals.avgOrderValue)}</Text>
              <Text style={styles.deltaMuted}>per paid order</Text>
            </View>
          </View>

          {/* Daily revenue */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Daily revenue</Text>
              {selected && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.readoutValue}>{formatINR(selected.revenue)}</Text>
                  <Text style={styles.readoutSub}>
                    {fullDay(selected.date)} · {selected.orders} order{selected.orders === 1 ? '' : 's'}
                  </Text>
                </View>
              )}
            </View>
            {report.totals.orders === 0 ? (
              <View style={styles.chartEmpty}>
                <BarChart3 size={22} color={theme.colors.textMuted} />
                <Text style={styles.chartEmptyText}>No sales in this period yet. Paid orders will show up here.</Text>
              </View>
            ) : (
              <BarChart
                data={dayBars}
                height={210}
                selectedIndex={selectedDay}
                onSelect={(i) => {
                  haptics.tap();
                  setSelectedDay(i);
                }}
                formatAxis={formatINRCompact}
                labelEvery={range === 7 ? 1 : 5}
              />
            )}
            <Text style={styles.hint}>Tap a bar to see that day. Only paid orders count as revenue.</Text>
          </View>

          {/* Today by hour */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardTitle}>Today by hour</Text>
                {peakHour && peakHour.revenue > 0 && (
                  <Text style={styles.readoutSub}>Busiest: {hourLabel(peakHour.hour)}</Text>
                )}
              </View>
              {selectedHourPoint && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.readoutValue}>{formatINR(selectedHourPoint.value)}</Text>
                  <Text style={styles.readoutSub}>{hourLabel(Number(selectedHourPoint.key))}</Text>
                </View>
              )}
            </View>
            {hourlyHasData ? (
              <BarChart
                data={hourBars}
                height={150}
                selectedIndex={selectedHour}
                onSelect={(i) => {
                  haptics.tap();
                  setSelectedHour(i);
                }}
                formatAxis={formatINRCompact}
                labelEvery={3}
              />
            ) : (
              <View style={styles.chartEmpty}>
                <Text style={styles.chartEmptyText}>No orders yet today.</Text>
              </View>
            )}
          </View>

          {/* Payment split */}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: theme.spacing.md }]}>Payment methods</Text>
            {splitRows.every((r) => r.value === 0) ? (
              <Text style={styles.chartEmptyText}>No paid orders in this period.</Text>
            ) : (
              splitRows.map((r) => {
                const pct = report.totals.revenue > 0 ? Math.round((r.value / report.totals.revenue) * 100) : 0;
                return (
                  <View key={r.label} style={styles.hRow}>
                    <View style={styles.hRowTop}>
                      <Text style={styles.hLabel}>{r.label}</Text>
                      <Text style={styles.hValue}>
                        {formatINR(r.value)} <Text style={styles.hPct}>· {pct}%</Text>
                      </Text>
                    </View>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${(r.value / splitMax) * 100}%` }]} />
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Top items */}
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: theme.spacing.md }]}>Top selling items</Text>
            {report.topItems.length === 0 ? (
              <Text style={styles.chartEmptyText}>No items sold in this period.</Text>
            ) : (
              report.topItems.map((t, i) => (
                <View key={t.name} style={styles.hRow}>
                  <View style={styles.hRowTop}>
                    <Text style={styles.hLabel} numberOfLines={1}>
                      <Text style={styles.rank}>{i + 1}. </Text>
                      {t.name}
                    </Text>
                    <Text style={styles.hValue}>
                      {t.quantity} sold <Text style={styles.hPct}>· {formatINR(t.revenue)}</Text>
                    </Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(t.quantity / topMax) * 100}%` }]} />
                  </View>
                </View>
              ))
            )}
          </View>

          <Text style={styles.footnote}>
            {dayMonth(report.from)} – {dayMonth(report.to)} · Cancelled orders are not counted.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
        <ArrowLeft size={19} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>Sales report</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },

  segmentWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  segment: { flexDirection: 'row', backgroundColor: '#EAE5DC', borderRadius: theme.radius.md, padding: 3 },
  segmentItem: { flex: 1, height: 38, borderRadius: theme.radius.md - 2, justifyContent: 'center', alignItems: 'center' },
  segmentItemActive: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#2B1F14', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1,
  },
  segmentText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  segmentTextActive: { color: theme.colors.textPrimary },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md, gap: theme.spacing.md },
  cardTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },

  kpiRow: { flexDirection: 'row', gap: theme.spacing.md },
  kpiWide: { flex: 1 },
  kpiHalf: { flex: 1 },
  kpiLabel: { fontSize: 13, color: theme.colors.textSecondary, fontFamily: theme.typography.font.medium},
  kpiValueLarge: { fontSize: 30, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginTop: 4, marginBottom: 6 },
  kpiValue: { fontSize: 22, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginTop: 4, marginBottom: 6 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deltaText: { fontSize: 12, fontFamily: theme.typography.font.semibold},
  deltaMuted: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },

  readoutValue: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  readoutSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  hint: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: theme.spacing.sm },

  chartEmpty: { height: 150, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  chartEmptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center' },

  hRow: { marginBottom: theme.spacing.md },
  hRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: theme.spacing.sm },
  hLabel: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  hValue: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  hPct: { fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  rank: { color: theme.colors.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: '#EAE5DC', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },

  footnote: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, textAlign: 'center' },
});
