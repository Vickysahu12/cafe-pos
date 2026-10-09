// app/(admin)/sales-report.tsx
// USE CASE (2026-09-30): Owner ka Sales Report — Dashboard pe "Net Revenue" tap karke khulta
// hai. 7 / 30 din ka daily revenue graph (bar tap = us din ka ₹ + orders), pichle period se
// comparison, aaj ke busiest hours, payment split aur top items. Demo mein owner ko
// "yeh raha aapka business, ek nazar mein" dikhane ke liye — onboarding ka strong point.
//
// ADDED (2026-10-09) — REPORTS BATCH 1 (Petpooja se aage):
//  Period: Today · Yesterday · 7 days · 30 days (har period cache — wapas aao to turant dikhe)
//  1. Revenue / orders / avg bill / items per order — FAIR comparison: "aaj abhi tak" vs
//     "kal isi waqt tak" + "pichle hafte isi din isi waqt tak" (poore din se nahi — warna
//     har subah -80% dikhta)
//  2. Day closing (Today/Yesterday): cash / UPI / card, unpaid, pehla-aakhri order +
//     "Share summary" (WhatsApp pe partner ko bhejo)
//  3. Sales by hour (din) / by day (7/30)
//  4. Busy hours heatmap (pichle 4 hafte) — staff planning
//  5. Items: best sellers · slow movers (menu se hatane layak) · categories
//  6. Orders kahan se: counter vs QR self-order, dine-in / takeaway
//  7. Staff: kisne kitna bill kiya, discounts, voided bills
//  8. Discounts & cancellations: paisa kahan "leak" ho raha — reason + kisne kiya
//  9. Export → CSV (Excel / CA): orders ya item sales
// 10. ADDED (2026-10-09) Stock & profit: food cost %, ingredients pe kharcha, profit, wastage ₹,
//     stock count mein gayab ₹ (sirf jab recipes/stock use ho rahe hon)
//  Ek hi API call (analytics/insights) — backend insights.service.ts. Owner-only (backend 403).
//
// CONNECTED TO: analytics.api.ts, components/charts/BarChart.tsx, components/reports/Heatmap.tsx,
// lib/share-csv.ts, lib/format.ts, dashboard.tsx (hero se yahan aate hain).

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Share, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  TrendingUp, TrendingDown, Minus, BarChart3, ShieldAlert, Download, FileSpreadsheet, ListOrdered,
  Share2, CheckCircle2, QrCode, ChevronRight, Ban, BadgePercent, Undo2, Clock3, Package,
} from 'lucide-react-native';
import { analyticsApi, Insights, InsightPeriod, StaffStat } from '../../features/analytics/analytics.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { useScreenLoad } from '../../lib/use-screen-load';
import { haptics } from '../../lib/haptics';
import { getErrorMessage } from '../../lib/api-client';
import { shareCsv } from '../../lib/share-csv';
import { formatINR, formatINRCompact, weekdayShort, dayMonth, fullDay, hourLabel } from '../../lib/format';
import { BarChart } from '../../components/charts/BarChart';
import { Heatmap, hourRange } from '../../components/reports/Heatmap';
import { PressScale } from '../../components/ui/PressScale';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { Skeleton, SkeletonStatCard } from '../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { theme } from '../../theme';
import { kds } from '../../theme/brand';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button

const PERIODS: { key: InsightPeriod; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

const ROLE_LABEL: Record<StaffStat['role'], string> = { OWNER: 'Owner', MANAGER: 'Manager', CASHIER: 'Cashier', CHEF: 'Chef' };
const TYPE_LABEL: Record<string, string> = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

/** "14:05" (IST, backend se) → "2:05 PM" */
function time12(hhmm: string | null | undefined): string {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Pichle period se % change. null = comparison ka matlab nahi (pichla 0) */
function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** Comparison ke labels — period ke hisaab se, saaf likha ki KISSE compare ho raha */
function compareLabels(ins: Insights) {
  const wd = weekdayShort(ins.from);
  switch (ins.period) {
    case 'today':
      return { prev: 'this time yesterday', prevShort: 'vs yesterday', week: `this time last ${wd}` };
    case 'yesterday':
      return { prev: 'the day before', prevShort: 'vs day before', week: `last week's ${wd}` };
    case '7d':
      return { prev: 'the 7 days before', prevShort: 'vs prev. 7 days', week: null };
    default:
      return { prev: 'the 30 days before', prevShort: 'vs prev. 30 days', week: null };
  }
}

/** ▲ 12% vs … — dark = espresso hero pe (bright green/red), warna normal semantic colours */
function Delta({ current, previous, label, dark, compact }: { current: number; previous: number; label: string; dark?: boolean; compact?: boolean }) {
  const pct = percentChange(current, previous);
  const muted = dark ? 'rgba(255,255,255,0.6)' : theme.colors.textMuted;
  if (pct === null) {
    if (compact) return <Text style={[styles.deltaMuted, { color: muted }]}>{label}: no sales</Text>;
    return <Text style={[styles.deltaMuted, { color: muted }]}>{current > 0 ? `No sales ${label} to compare` : '—'}</Text>;
  }
  const flat = pct === 0;
  const up = pct > 0;
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const color = flat
    ? (dark ? 'rgba(255,255,255,0.75)' : theme.colors.textSecondary)
    : up
      ? (dark ? kds.green : theme.colors.success)
      : (dark ? kds.red : theme.colors.danger);
  const pctText = Math.abs(pct) > 999 ? '999%+' : `${Math.abs(pct)}%`;
  return (
    <View style={styles.deltaRow} accessibilityLabel={`${flat ? 'Same as' : up ? `Up ${pctText}` : `Down ${pctText}`} ${compact ? label : `vs ${label}`}`}>
      <Icon size={13} color={color} />
      <Text style={[styles.deltaText, { color }]} numberOfLines={1}>
        {flat ? 'Same' : pctText}
        <Text style={[styles.deltaLabel, { color: dark ? 'rgba(255,255,255,0.7)' : theme.colors.textSecondary }]}>
          {' '}{compact ? label : `vs ${label}`}
        </Text>
      </Text>
    </View>
  );
}

function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          {!!subtitle && <Text style={styles.cardSubtitle}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function Bar({ pct, color = theme.colors.primary }: { pct: number; color?: string }) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

export default function SalesReportScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const role = user?.role;
  const [period, setPeriod] = useState<InsightPeriod>('today');
  // Har period ka data alag — wapas switch karo to turant dikhe (background mein refresh hota hai).
  // Key = jis period ke liye request gayi thi, isliye jaldi-jaldi switch karne pe purana
  // (dheema) response naye period ka data overwrite nahi kar sakta.
  const [byPeriod, setByPeriod] = useState<Partial<Record<InsightPeriod, Insights>>>({});
  const periodRef = useRef(period);
  periodRef.current = period;

  const [selectedBar, setSelectedBar] = useState<number | null>(null);
  const [itemTab, setItemTab] = useState<'top' | 'slow' | 'categories'>('top');
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<'orders' | 'items' | null>(null);

  const { loading, refreshing, error, refresh, retry, reload } = useScreenLoad(async () => {
    if (role !== 'OWNER') return;
    const p = periodRef.current;
    const data = await analyticsApi.getInsights(p);
    setByPeriod((prev) => ({ ...prev, [p]: data }));
  });

  const changePeriod = (next: InsightPeriod) => {
    if (next === period) return;
    haptics.tap();
    setPeriod(next);
    setSelectedBar(null);
  };

  // Period badla → us period ke saath reload (render ke BAAD, jab periodRef naya ho).
  // Pehli baar skip — useScreenLoad khud focus pe load karta hai.
  const isFirstPeriod = useRef(true);
  useEffect(() => {
    if (isFirstPeriod.current) {
      isFirstPeriod.current = false;
      return;
    }
    reload();
  }, [period, reload]);

  const ins = byPeriod[period] ?? null;
  const isDay = period === 'today' || period === 'yesterday';
  // Slow movers ek din mein fair nahi (kal ka "0 bika" item aaj best-seller ho sakta) → sirf 7/30
  const activeItemTab = isDay && itemTab === 'slow' ? 'top' : itemTab;

  // Chart: din → ghante ke bars; 7/30 → din ke bars
  const chart = useMemo(() => {
    if (!ins) return { bars: [], hasData: false, labelEvery: 1 };
    if (isDay) {
      const active = ins.hourly.filter((h) => h.orders > 0).map((h) => h.hour);
      const from = Math.min(9, ...(active.length ? active : [9]));
      const to = Math.max(22, ...(active.length ? active : [22]));
      const bars = ins.hourly
        .filter((h) => h.hour >= from && h.hour <= to)
        .map((h) => ({
          key: String(h.hour),
          value: h.revenue,
          label: hourLabel(h.hour).replace(' ', '').toLowerCase(),
          a11yLabel: `${hourLabel(h.hour)}: ${formatINR(h.revenue)}, ${h.orders} orders`,
          orders: h.orders,
          title: hourRange(h.hour),
        }));
      return { bars, hasData: active.length > 0, labelEvery: 3 };
    }
    const bars = ins.series.map((d) => ({
      key: d.date,
      value: d.revenue,
      label: period === '7d' ? weekdayShort(d.date) : dayMonth(d.date).split(' ')[0],
      a11yLabel: `${fullDay(d.date)}: ${formatINR(d.revenue)}, ${d.orders} orders`,
      orders: d.orders,
      title: fullDay(d.date),
    }));
    return { bars, hasData: ins.kpis.orders > 0, labelEvery: period === '7d' ? 1 : 5 };
  }, [ins, isDay, period]);

  const bestBar = chart.bars.reduce<(typeof chart.bars)[number] | null>((b, x) => (x.value > (b?.value ?? 0) ? x : b), null);
  const shownBar = selectedBar !== null ? chart.bars[selectedBar] : bestBar;

  const doExport = async (type: 'orders' | 'items') => {
    if (exporting) return;
    setExporting(type);
    try {
      const csv = await analyticsApi.exportCsv(period, type);
      const from = ins?.from ?? '';
      const to = ins?.to ?? '';
      const range = from && to && from !== to ? `${from}_to_${to}` : from;
      await shareCsv(`billraw-${type}-${range || period}.csv`, csv);
      haptics.success();
      setExportOpen(false);
    } catch (err) {
      haptics.error();
      Alert.alert('Export failed', getErrorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const shareSummary = async () => {
    if (!ins?.closing) return;
    const c = ins.closing;
    const lines = [
      `${user?.outletName ?? 'Cafe'} · Day closing`,
      `${fullDay(c.date)}${c.isLive ? ` (as of ${time12(c.asOf)})` : ''}`,
      '',
      `Sales: ${formatINR(ins.kpis.revenue)} (${ins.kpis.orders} order${ins.kpis.orders === 1 ? '' : 's'})`,
      `Cash ${formatINR(c.cash.amount)} · UPI ${formatINR(c.upi.amount)} · Card ${formatINR(c.card.amount)}${c.other.amount > 0 ? ` · Other ${formatINR(c.other.amount)}` : ''}`,
      `Avg bill: ${formatINR(ins.kpis.avgBill)}`,
      ins.leakage.unpaid.count > 0 ? `Unpaid: ${ins.leakage.unpaid.count} bill${ins.leakage.unpaid.count === 1 ? '' : 's'}, ${formatINR(ins.leakage.unpaid.amount)}` : null,
      ins.leakage.discounts.amount > 0 ? `Discounts: ${formatINR(ins.leakage.discounts.amount)} on ${ins.leakage.discounts.orders} bill${ins.leakage.discounts.orders === 1 ? '' : 's'}` : null,
      ins.leakage.cancelled.count > 0 ? `Cancelled: ${ins.leakage.cancelled.count} (${formatINR(ins.leakage.cancelled.amount)})` : null,
      ins.items.top[0] ? `Top item: ${ins.items.top[0].name} (${ins.items.top[0].quantity} sold)` : null,
      '',
      'Sent from BillRaw',
    ].filter((l): l is string => l !== null);
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user ne share sheet band kiya — kuch nahi karna
    }
  };

  // Owner-only (backend bhi 403 deta hai) — Manager galti se deep-link se aaye to
  if (role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header />
        <EmptyState icon={ShieldAlert} title="Owner only" message="Sales reports are visible to the cafe Owner." />
      </SafeAreaView>
    );
  }

  const subtitle = !ins
    ? 'Sales, items, staff and more'
    : isDay
      ? `${fullDay(ins.from)}${ins.isLive ? ` · updated ${time12(ins.asOf)}` : ''}`
      : `${dayMonth(ins.from)} – ${dayMonth(ins.to)}${ins.isLive ? ` · updated ${time12(ins.asOf)}` : ''}`;
  const labels = ins ? compareLabels(ins) : null;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Header
        subtitle={subtitle}
        right={
          <PressScale
            style={styles.exportBtn}
            onPress={() => setExportOpen(true)}
            disabled={!ins}
            accessibilityLabel="Export report to Excel"
          >
            <Download size={16} color={theme.colors.textPrimary} />
            <Text style={styles.exportText}>Export</Text>
          </PressScale>
        }
      />

      {/* Period toggle */}
      <View style={styles.segmentWrap}>
        <View style={styles.segment} accessibilityRole="tablist">
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <Pressable
                key={p.key}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => changePeriod(p.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!ins ? (
        error && !loading ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <View style={styles.content}>
            <Skeleton height={150} radius={theme.radius.xl} />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <SkeletonStatCard style={{ flex: 1 }} />
              <SkeletonStatCard style={{ flex: 1 }} />
            </View>
            <Skeleton height={240} radius={theme.radius.lg} />
            <Skeleton height={180} radius={theme.radius.lg} />
          </View>
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
        >
          {/* ── 1. Revenue hero + KPIs ── */}
          <View style={styles.hero}>
            <View style={styles.heroGlow} pointerEvents="none" />
            <Text style={styles.heroLabel}>{period === 'today' ? 'Sales so far' : 'Sales'}</Text>
            <Text style={styles.heroValue} accessibilityLabel={`Sales ${formatINR(ins.kpis.revenue)}`}>{formatINR(ins.kpis.revenue)}</Text>
            <View style={{ gap: 4 }}>
              <Delta current={ins.kpis.revenue} previous={ins.previous.revenue} label={labels!.prev} dark />
              {ins.lastWeek && labels!.week && (
                <Delta current={ins.kpis.revenue} previous={ins.lastWeek.revenue} label={labels!.week} dark />
              )}
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={[styles.card, styles.kpiTile]}>
              <Text style={styles.kpiLabel}>Orders</Text>
              <Text style={styles.kpiValue}>{ins.kpis.orders}</Text>
              <Delta current={ins.kpis.orders} previous={ins.previous.orders} label={labels!.prevShort} compact />
            </View>
            <View style={[styles.card, styles.kpiTile]}>
              <Text style={styles.kpiLabel}>Avg. bill</Text>
              <Text style={styles.kpiValue}>{formatINR(ins.kpis.avgBill)}</Text>
              <Delta current={ins.kpis.avgBill} previous={ins.previous.avgBill} label={labels!.prevShort} compact />
            </View>
          </View>
          <View style={styles.kpiRow}>
            <View style={[styles.card, styles.kpiTile]}>
              <Text style={styles.kpiLabel}>Items sold</Text>
              <Text style={styles.kpiValue}>{ins.kpis.itemsSold}</Text>
              <Text style={styles.deltaMuted}>{ins.kpis.itemsPerOrder > 0 ? `${ins.kpis.itemsPerOrder} per order` : '—'}</Text>
            </View>
            <View style={[styles.card, styles.kpiTile]}>
              <Text style={styles.kpiLabel}>Paid bills</Text>
              <Text style={styles.kpiValue}>{ins.kpis.paidOrders}</Text>
              <Text style={styles.deltaMuted}>
                {ins.leakage.unpaid.count > 0 ? `${ins.leakage.unpaid.count} not paid yet` : 'All bills paid'}
              </Text>
            </View>
          </View>

          {/* ── 2. Day closing (Today / Yesterday) ── */}
          {ins.closing && (
            <Card
              title="Day closing"
              subtitle={ins.closing.isLive ? `So far today · as of ${time12(ins.closing.asOf)}` : `${fullDay(ins.closing.date)} · final`}
            >
              {[
                { label: 'Cash', v: ins.closing.cash },
                { label: 'UPI', v: ins.closing.upi },
                { label: 'Card', v: ins.closing.card },
                ...(ins.closing.other.amount > 0 ? [{ label: 'Other', v: ins.closing.other }] : []),
              ].map((r) => (
                <View key={r.label} style={styles.lineRow}>
                  <Text style={styles.lineLabel}>{r.label}</Text>
                  <Text style={styles.lineMeta}>{r.v.orders} bill{r.v.orders === 1 ? '' : 's'}</Text>
                  <Text style={styles.lineValue}>{formatINR(r.v.amount)}</Text>
                </View>
              ))}
              <View style={styles.divider} />
              <View style={styles.lineRow}>
                <Text style={styles.lineLabelStrong}>Collected</Text>
                <Text style={styles.lineValueStrong}>{formatINR(ins.closing.collected)}</Text>
              </View>
              {ins.leakage.unpaid.count > 0 && (
                <View style={styles.lineRow}>
                  <Text style={[styles.lineLabel, { color: theme.colors.warning }]}>
                    {ins.closing.isLive ? 'To collect' : 'Left unpaid'} · {ins.leakage.unpaid.count} bill{ins.leakage.unpaid.count === 1 ? '' : 's'}
                  </Text>
                  <Text style={[styles.lineValue, { color: theme.colors.warning }]}>{formatINR(ins.leakage.unpaid.amount)}</Text>
                </View>
              )}
              <View style={styles.timesRow}>
                <Clock3 size={14} color={theme.colors.textMuted} />
                <Text style={styles.timesText}>
                  {ins.closing.firstOrderAt
                    ? `First order ${time12(ins.closing.firstOrderAt)} · last ${time12(ins.closing.lastOrderAt)}`
                    : 'No orders yet'}
                </Text>
              </View>
              <PressScale style={styles.secondaryBtn} onPress={shareSummary} accessibilityLabel="Share day closing summary">
                <Share2 size={16} color={theme.colors.textPrimary} />
                <Text style={styles.secondaryBtnText}>Share summary</Text>
              </PressScale>
            </Card>
          )}

          {/* ── 3. Sales chart ── */}
          <Card
            title={isDay ? 'Sales by hour' : 'Sales by day'}
            right={
              shownBar && shownBar.value > 0 ? (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.readoutValue}>{formatINR(shownBar.value)}</Text>
                  <Text style={styles.readoutSub}>
                    {selectedBar === null ? 'Best: ' : ''}{shownBar.title} · {shownBar.orders} order{shownBar.orders === 1 ? '' : 's'}
                  </Text>
                </View>
              ) : undefined
            }
          >
            {chart.hasData ? (
              <BarChart
                data={chart.bars}
                height={isDay ? 160 : 210}
                selectedIndex={selectedBar}
                onSelect={(i) => {
                  haptics.tap();
                  setSelectedBar(i);
                }}
                formatAxis={formatINRCompact}
                labelEvery={chart.labelEvery}
              />
            ) : (
              <View style={styles.chartEmpty}>
                <BarChart3 size={22} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>
                  {period === 'today' ? 'No orders yet today. Sales show up here as bills are paid.' : 'No sales in this period.'}
                </Text>
              </View>
            )}
            <Text style={styles.hint}>Tap a bar for details. Only paid bills count as sales.</Text>
          </Card>

          {/* ── 4. Busy hours heatmap ── */}
          <Card title="Busy hours" subtitle={ins.heatmap.days > 0 ? `Average orders, last 4 weeks (${dayMonth(ins.heatmap.from)} – ${dayMonth(ins.heatmap.to)})` : undefined}>
            {ins.heatmap.days > 0 ? (
              <>
                <Heatmap data={ins.heatmap.avgOrders} peak={ins.heatmap.peak} />
                <Text style={styles.hint}>Plan staff and prep for the darkest slots. Tap any box to see it.</Text>
              </>
            ) : (
              <Text style={styles.emptyText}>Your busy hours appear here after your first full day of orders.</Text>
            )}
          </Card>

          {/* ── 5. Items ── */}
          <Card title="Items">
            <View style={styles.pillRow}>
              {([
                { key: 'top', label: 'Best sellers' },
                ...(isDay ? [] : [{ key: 'slow', label: 'Slow movers' }]),
                { key: 'categories', label: 'Categories' },
              ] as { key: typeof itemTab; label: string }[]).map((t) => {
                const active = activeItemTab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => { haptics.tap(); setItemTab(t.key); }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {activeItemTab === 'top' && (
              ins.items.top.length === 0 ? (
                <Text style={styles.emptyText}>No items sold in this period.</Text>
              ) : (
                ins.items.top.map((t, i) => (
                  <View key={t.productId} style={styles.hRow}>
                    <View style={styles.hRowTop}>
                      <Text style={styles.hLabel} numberOfLines={1}>
                        <Text style={styles.rank}>{i + 1}. </Text>
                        {t.name}
                      </Text>
                      <Text style={styles.hValue}>
                        {t.quantity} sold <Text style={styles.hPct}>· {formatINR(t.revenue)}</Text>
                      </Text>
                    </View>
                    <Bar pct={(t.quantity / Math.max(1, ins.items.top[0].quantity)) * 100} />
                  </View>
                ))
              )
            )}

            {activeItemTab === 'slow' && (
              ins.items.slow.length === 0 ? (
                <Text style={styles.emptyText}>
                  {ins.items.listedCount === 0 ? 'Add items to your menu to see this.' : 'Every item on your menu is in the best-seller list. Nice!'}
                </Text>
              ) : (
                <>
                  {ins.items.slow.map((t) => (
                    <View key={t.productId} style={styles.slowRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.hLabel} numberOfLines={1}>{t.name}</Text>
                        <Text style={styles.metaText} numberOfLines={1}>{t.category}</Text>
                      </View>
                      <Text style={[styles.hValue, t.quantity === 0 && { color: theme.colors.danger }]}>
                        {t.quantity === 0 ? 'Not sold' : `${t.quantity} sold`}
                      </Text>
                    </View>
                  ))}
                  {ins.items.notSoldCount > 0 && (
                    <Text style={styles.hint}>
                      {ins.items.notSoldCount} of {ins.items.listedCount} menu items didn't sell in this period. Try them in a combo, or remove them to keep the menu short.
                    </Text>
                  )}
                </>
              )
            )}

            {activeItemTab === 'categories' && (
              ins.items.categories.length === 0 ? (
                <Text style={styles.emptyText}>No items sold in this period.</Text>
              ) : (
                <>
                  {ins.items.categories.map((c) => (
                    <View key={c.name} style={styles.hRow}>
                      <View style={styles.hRowTop}>
                        <Text style={styles.hLabel} numberOfLines={1}>{c.name}</Text>
                        <Text style={styles.hValue}>
                          {formatINR(c.revenue)} <Text style={styles.hPct}>· {Math.round(c.share)}%</Text>
                        </Text>
                      </View>
                      <Bar pct={c.share} color={theme.colors.accent} />
                    </View>
                  ))}
                  <Text style={styles.hint}>Share of item sales, before tax and discounts.</Text>
                </>
              )
            )}
          </Card>

          {/* ── 6. Where orders come from ── */}
          {ins.kpis.orders > 0 && (
            <Card title="Where orders come from">
              {(() => {
                const total = ins.channels.counter.orders + ins.channels.qr.orders;
                const qrPct = total > 0 ? Math.round((ins.channels.qr.orders / total) * 100) : 0;
                const types = Object.entries(ins.orderTypes).filter(([, v]) => v.orders > 0);
                return (
                  <>
                    <View style={styles.stackTrack}>
                      <View style={{ flex: Math.max(0.0001, ins.channels.counter.orders), backgroundColor: theme.colors.primary }} />
                      <View style={{ flex: Math.max(0.0001, ins.channels.qr.orders), backgroundColor: theme.colors.accent }} />
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
                        <Text style={styles.legendLabel}>Counter</Text>
                        <Text style={styles.legendValue}>{ins.channels.counter.orders}</Text>
                      </View>
                      <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: theme.colors.accent }]} />
                        <Text style={styles.legendLabel}>QR self-order</Text>
                        <Text style={styles.legendValue}>{ins.channels.qr.orders}</Text>
                      </View>
                    </View>
                    {types.length > 0 && (
                      <Text style={styles.metaText}>
                        {types.map(([k, v]) => `${TYPE_LABEL[k] ?? k} ${v.orders}`).join(' · ')}
                      </Text>
                    )}
                    {ins.channels.qr.orders === 0 ? (
                      <PressScale style={styles.nudge} onPress={() => router.push('/(admin)/qr-code')} accessibilityLabel="Open QR codes">
                        <QrCode size={18} color={theme.colors.accentInk} />
                        <Text style={styles.nudgeText}>Put table QR codes out so guests can order and you bill less at the counter.</Text>
                        <ChevronRight size={16} color={theme.colors.textMuted} />
                      </PressScale>
                    ) : (
                      <Text style={styles.hint}>{qrPct}% of orders came from guests scanning your QR.</Text>
                    )}
                  </>
                );
              })()}
            </Card>
          )}

          {/* ── 6b. Payment methods (7/30 — din ke liye closing card mein hai) ── */}
          {!isDay && (
            <Card title="Payment methods">
              {(() => {
                const s = ins.paymentSplit;
                const rows = [
                  { label: 'Cash', value: s.cash },
                  { label: 'UPI', value: s.upi },
                  { label: 'Card', value: s.card },
                  ...(s.other > 0 ? [{ label: 'Other', value: s.other }] : []),
                ].sort((a, b) => b.value - a.value);
                const max = Math.max(1, ...rows.map((r) => r.value));
                if (rows.every((r) => r.value === 0)) return <Text style={styles.emptyText}>No paid bills in this period.</Text>;
                return rows.map((r) => (
                  <View key={r.label} style={styles.hRow}>
                    <View style={styles.hRowTop}>
                      <Text style={styles.hLabel}>{r.label}</Text>
                      <Text style={styles.hValue}>
                        {formatINR(r.value)}{' '}
                        <Text style={styles.hPct}>· {ins.kpis.revenue > 0 ? Math.round((r.value / ins.kpis.revenue) * 100) : 0}%</Text>
                      </Text>
                    </View>
                    <Bar pct={(r.value / max) * 100} />
                  </View>
                ));
              })()}
            </Card>
          )}

          {/* ── 7. Staff ── */}
          <Card title="Staff" subtitle="Who billed what">
            {ins.staff.length === 0 ? (
              <Text style={styles.emptyText}>Staff activity shows here once bills are made from the app.</Text>
            ) : (
              ins.staff.map((s, i) => {
                const flags: string[] = [];
                if (s.discountsGiven > 0) flags.push(`${s.discountsGiven} discount${s.discountsGiven === 1 ? '' : 's'} (${formatINR(s.discountAmount)})`);
                if (s.cancelsDone > 0) flags.push(`cancelled ${s.cancelsDone}`);
                if (s.billsVoided > 0) flags.push(`${s.billsVoided} of their bill${s.billsVoided === 1 ? '' : 's'} cancelled`);
                return (
                  <View key={s.userId} style={[styles.staffRow, i > 0 && styles.staffRowBorder]}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{s.name.trim().charAt(0).toUpperCase() || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hLabel} numberOfLines={1}>
                        {s.name}
                        <Text style={styles.roleText}>  {ROLE_LABEL[s.role]}{s.isActive ? '' : ' · removed'}</Text>
                      </Text>
                      <Text style={styles.metaText} numberOfLines={2}>
                        {s.orders} order{s.orders === 1 ? '' : 's'}
                        {s.avgBill > 0 ? ` · avg ${formatINR(s.avgBill)}` : ''}
                        {flags.length > 0 && <Text style={{ color: theme.colors.warning }}>{' · '}{flags.join(' · ')}</Text>}
                      </Text>
                    </View>
                    <Text style={styles.hValue}>{formatINR(s.revenue)}</Text>
                  </View>
                );
              })
            )}
          </Card>

          {/* ── 8. Discounts & cancellations ── */}
          <Card title="Discounts and cancellations" subtitle="Money that didn't reach the counter">
            {(() => {
              const l = ins.leakage;
              const clean = l.discounts.amount === 0 && l.cancelled.count === 0;
              return (
                <>
                  <View style={styles.leakGrid}>
                    <LeakTile
                      icon={BadgePercent}
                      label="Discounts"
                      value={formatINR(l.discounts.amount)}
                      sub={l.discounts.orders > 0 ? `${l.discounts.orders} bill${l.discounts.orders === 1 ? '' : 's'} · ${l.discounts.percentOfSales}% of sales` : 'None'}
                      tone={l.discounts.amount > 0 ? 'warning' : 'neutral'}
                    />
                    <LeakTile
                      icon={Ban}
                      label="Cancelled"
                      value={String(l.cancelled.count)}
                      sub={l.cancelled.count > 0 ? formatINR(l.cancelled.amount) : 'None'}
                      tone={l.cancelled.count > 0 ? 'warning' : 'neutral'}
                    />
                  </View>
                  {l.refunded.count > 0 && (
                    <View style={styles.alertRow}>
                      <Undo2 size={16} color={theme.colors.danger} />
                      <Text style={styles.alertText}>
                        {l.refunded.count} bill{l.refunded.count === 1 ? ' was' : 's were'} paid and then cancelled ({formatINR(l.refunded.amount)}). Check the cash drawer matches.
                      </Text>
                    </View>
                  )}

                  {clean ? (
                    <View style={styles.cleanRow}>
                      <CheckCircle2 size={16} color={theme.colors.success} />
                      <Text style={styles.cleanText}>No discounts or cancellations in this period.</Text>
                    </View>
                  ) : (
                    <>
                      {l.recentCancellations.length > 0 && (
                        <>
                          <Text style={styles.listTitle}>Recent cancellations</Text>
                          {l.recentCancellations.map((c, i) => (
                            <View key={`c${i}`} style={styles.eventRow}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.eventTitle} numberOfLines={1}>
                                  {c.orderNumber !== null ? `#${c.orderNumber}` : 'Order'} · {isDay ? time12(c.at) : `${dayMonth(c.date)}, ${time12(c.at)}`} · by {c.by}
                                </Text>
                                <Text style={styles.eventReason} numberOfLines={2}>"{c.reason}"</Text>
                              </View>
                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.hValue}>{formatINR(c.amount)}</Text>
                                {c.wasPaid && <Text style={styles.paidTag}>Was paid</Text>}
                              </View>
                            </View>
                          ))}
                        </>
                      )}
                      {l.recentDiscounts.length > 0 && (
                        <>
                          <Text style={styles.listTitle}>Recent discounts</Text>
                          {l.recentDiscounts.map((d, i) => (
                            <View key={`d${i}`} style={styles.eventRow}>
                              <Text style={[styles.eventTitle, { flex: 1 }]} numberOfLines={1}>
                                {d.orderNumber !== null ? `#${d.orderNumber}` : 'Order'} · {isDay ? time12(d.at) : `${dayMonth(d.date)}, ${time12(d.at)}`} · by {d.by}
                              </Text>
                              <Text style={styles.hValue}>
                                {formatINR(d.amount)} <Text style={styles.hPct}>· {d.percent}%</Text>
                              </Text>
                            </View>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </Card>

          {/* ── 9. Stock & profit (STOCK SOP, 2026-10-09) ── */}
          {ins.stock?.hasData && (
            <Card
              title="Stock and profit"
              subtitle="From recipes and stock entries"
              right={
                <Pressable onPress={() => router.push('/(admin)/inventory')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Open stock">
                  <Package size={18} color={theme.colors.textSecondary} />
                </Pressable>
              }
            >
              {ins.stock.coveredSales > 0 ? (
                <>
                  <View style={styles.profitTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kpiLabel}>Food cost</Text>
                      <Text
                        style={[
                          styles.profitPct,
                          { color: ins.stock.foodCostPct <= 35 ? theme.colors.success : ins.stock.foodCostPct <= 45 ? theme.colors.warning : theme.colors.danger },
                        ]}
                      >
                        {Math.round(ins.stock.foodCostPct)}%
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.kpiLabel}>Profit after ingredients</Text>
                      <Text style={styles.profitValue}>{formatINR(ins.stock.grossProfit)}</Text>
                    </View>
                  </View>
                  <Text style={styles.metaText}>
                    {formatINR(ins.stock.cogs)} of ingredients for {formatINR(ins.stock.coveredSales)} of sales. Most cafés aim for 25–35%.
                  </Text>
                </>
              ) : (
                <Text style={styles.emptyText}>Add recipes to your menu items to see food cost and profit.</Text>
              )}
              {(ins.stock.wastageValue > 0 || ins.stock.countMissingValue > 0) && (
                <View style={[styles.leakGrid, { marginTop: theme.spacing.md }]}>
                  <LeakTile
                    icon={Ban}
                    label="Wastage"
                    value={formatINR(ins.stock.wastageValue)}
                    sub="Spilled, expired, cancelled food"
                    tone={ins.stock.wastageValue > 0 ? 'warning' : 'neutral'}
                  />
                  <LeakTile
                    icon={Package}
                    label="Missing in counts"
                    value={formatINR(ins.stock.countMissingValue)}
                    sub="Not explained by bills"
                    tone={ins.stock.countMissingValue > 0 ? 'warning' : 'neutral'}
                  />
                </View>
              )}
              {ins.stock.coveredSales > 0 && ins.stock.coveragePct < 95 && (
                <Text style={styles.hint}>
                  Based on items with recipes ({Math.round(ins.stock.coveragePct)}% of item sales). Add recipes to the rest for the full picture.
                </Text>
              )}
            </Card>
          )}

          <Text style={styles.footnote}>
            Sales count paid bills only. Cancelled orders are left out. Times are in IST.
          </Text>
        </ScrollView>
      )}

      {/* ── Export sheet ── */}
      <BottomSheet visible={exportOpen} onClose={() => !exporting && setExportOpen(false)} title="Export to Excel">
        <Text style={styles.sheetLead}>
          {ins ? (isDay ? fullDay(ins.from) : `${dayMonth(ins.from)} – ${dayMonth(ins.to)}`) : ''} · CSV file that opens in Excel or Google Sheets.
        </Text>
        {([
          { type: 'orders', icon: ListOrdered, title: 'Every bill', desc: 'Date, time, items, tax, discount, payment, staff' },
          { type: 'items', icon: FileSpreadsheet, title: 'Item sales', desc: 'Quantity and sales for each menu item' },
        ] as const).map((o) => (
          <PressScale
            key={o.type}
            style={[styles.sheetOption, !!exporting && exporting !== o.type && { opacity: 0.5 }]}
            onPress={() => doExport(o.type)}
            disabled={!!exporting}
            accessibilityLabel={`Export ${o.title}`}
          >
            <View style={styles.sheetIcon}>
              <o.icon size={20} color={theme.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>{o.title}</Text>
              <Text style={styles.metaText}>{o.desc}</Text>
            </View>
            {exporting === o.type ? <ActivityIndicator color={theme.colors.primary} /> : <ChevronRight size={18} color={theme.colors.textMuted} />}
          </PressScale>
        ))}
        <Text style={styles.sheetNote}>Customer phone numbers are never included.</Text>
      </BottomSheet>
    </SafeAreaView>
  );
}

function LeakTile({ icon: Icon, label, value, sub, tone }: { icon: React.ComponentType<{ size: number; color: string }>; label: string; value: string; sub: string; tone: 'warning' | 'neutral' }) {
  const warn = tone === 'warning';
  return (
    <View style={[styles.leakTile, warn && { backgroundColor: theme.colors.warningLight, borderColor: 'transparent' }]}>
      <View style={styles.leakTop}>
        <Icon size={15} color={warn ? theme.colors.warning : theme.colors.textMuted} />
        <Text style={[styles.kpiLabel, warn && { color: theme.colors.warning }]}>{label}</Text>
      </View>
      <Text style={styles.leakValue}>{value}</Text>
      <Text style={styles.metaText} numberOfLines={1}>{sub}</Text>
    </View>
  );
}

// UI REDESIGN (2026-10-09): Owner ka "Reports" TAB — tab ki root screen pe back arrow nahi.
// UPDATED (2026-10-09): subtitle ab period/updated time dikhata hai + right mein Export button.
function Header({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.tabTitleBlock}>
      <View style={{ flex: 1 }}>
        <Text style={styles.tabTitle}>Reports</Text>
        <Text style={styles.tabSubtitle} numberOfLines={1}>{subtitle ?? 'Sales, items, staff and more'}</Text>
      </View>
      {right}
    </View>
  );
}

const NUM = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  // ADDED (2026-10-09): Reports tab ka title block (More/Menu jaisa)
  tabTitleBlock: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.sm },
  tabTitle: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary },
  tabSubtitle: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4, ...NUM },
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  exportBtn: { ...ui.iconButton, width: undefined, flexDirection: 'row', gap: 6, paddingHorizontal: 14 },
  exportText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },

  segmentWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  segment: { flexDirection: 'row', backgroundColor: theme.colors.border, borderRadius: theme.radius.md, padding: 3 },
  segmentItem: { flex: 1, height: 38, borderRadius: theme.radius.md - 2, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
  segmentItemActive: {
    backgroundColor: theme.colors.surface,
    shadowColor: '#2B1F14', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 1,
  },
  segmentText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  segmentTextActive: { color: theme.colors.textPrimary },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  card: { ...ui.card, padding: theme.spacing.lg },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.md, gap: theme.spacing.md },
  cardTitle: { ...ui.sectionTitle },
  cardSubtitle: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },

  // Hero (Dashboard jaisa espresso card)
  hero: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.xl, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, overflow: 'hidden' },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -90, top: -120, backgroundColor: 'rgba(192,138,46,0.16)' },
  heroLabel: { fontSize: 14, fontFamily: theme.typography.font.regular, color: 'rgba(255,255,255,0.6)' },
  heroValue: { fontSize: 36, lineHeight: 44, fontFamily: theme.typography.font.semibold, color: theme.colors.white, marginTop: 2, marginBottom: 8, ...NUM },

  kpiRow: { flexDirection: 'row', gap: theme.spacing.md },
  kpiTile: { flex: 1, padding: 14 },
  kpiLabel: { fontSize: 13, color: theme.colors.textSecondary, fontFamily: theme.typography.font.medium },
  kpiValue: { fontSize: 22, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 4, marginBottom: 4, ...NUM },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deltaText: { flexShrink: 1, fontSize: 12, fontFamily: theme.typography.font.semibold, ...NUM },
  deltaLabel: { fontFamily: theme.typography.font.regular },
  deltaMuted: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },

  // Closing
  lineRow: { flexDirection: 'row', alignItems: 'baseline', paddingVertical: 6, gap: theme.spacing.sm },
  lineLabel: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
  lineMeta: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, ...NUM },
  lineValue: { minWidth: 84, textAlign: 'right', fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, ...NUM },
  lineLabelStrong: { flex: 1, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  lineValueStrong: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary, ...NUM },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 6 },
  timesRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.sm },
  timesText: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, ...NUM },
  secondaryBtn: {
    marginTop: theme.spacing.md, height: 44, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.colors.surface,
  },
  secondaryBtnText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },

  readoutValue: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary, ...NUM },
  readoutSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },
  hint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: theme.spacing.sm, lineHeight: 17 },

  chartEmpty: { height: 140, justifyContent: 'center', alignItems: 'center', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  emptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20 },

  // Items
  pillRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md, flexWrap: 'wrap' },
  pill: { height: 34, paddingHorizontal: 14, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center' },
  pillActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  pillText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  pillTextActive: { color: theme.colors.white },

  hRow: { marginBottom: theme.spacing.md },
  hRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: theme.spacing.sm },
  hLabel: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  hValue: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, ...NUM },
  hPct: { fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  rank: { color: theme.colors.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: theme.colors.border, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  slowRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  metaText: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },

  // Channels
  stackTrack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, backgroundColor: theme.colors.border },
  legendRow: { flexDirection: 'row', gap: theme.spacing.lg, marginTop: theme.spacing.md, marginBottom: 6, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  legendValue: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, ...NUM },
  nudge: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md, padding: 12,
    borderRadius: theme.radius.md, backgroundColor: theme.colors.primaryLight,
  },
  nudgeText: { flex: 1, fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary, lineHeight: 18 },

  // Staff
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 10 },
  staffRowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.primary },
  roleText: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },

  // Stock & profit (2026-10-09)
  profitTop: { flexDirection: 'row', gap: theme.spacing.md, marginBottom: theme.spacing.sm },
  profitPct: { fontSize: 28, fontFamily: theme.typography.font.semibold, marginTop: 2, ...NUM },
  profitValue: { fontSize: 22, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 6, ...NUM },

  // Leakage
  leakGrid: { flexDirection: 'row', gap: theme.spacing.sm },
  leakTile: { flex: 1, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, padding: 12 },
  leakTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leakValue: { fontSize: 20, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: 6, ...NUM },
  alertRow: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start', marginTop: theme.spacing.md, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.colors.dangerLight },
  alertText: { flex: 1, fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.danger, lineHeight: 18 },
  cleanRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  cleanText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.success },
  listTitle: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginTop: theme.spacing.lg, marginBottom: 4 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  eventTitle: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary, ...NUM },
  eventReason: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
  paidTag: { fontSize: 11, fontFamily: theme.typography.font.semibold, color: theme.colors.danger, marginTop: 2 },

  // Export sheet
  sheetLead: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginBottom: theme.spacing.md, lineHeight: 20 },
  sheetOption: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: 14, marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  sheetIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  sheetTitle: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  sheetNote: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: theme.spacing.xs, textAlign: 'center' },

  footnote: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, textAlign: 'center' },
});
