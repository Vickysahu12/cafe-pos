// app/(admin)/dashboard.tsx
// USE CASE: Executive Owner/Manager POS Dashboard Screen
// CONNECTED TO: analytics.api.ts, inventory.api.ts, auth.api.ts, tables.api.ts, and
//   useActiveOrders (live orders over Socket.io — Recent Activity and the card sublabels
//   update by themselves; any order event also re-pulls the KPI numbers, debounced).
//
// UI TRIAL (2026-10-08, branch ui-espresso-trial): BillRaw brand look (espresso + roast gold,
// Geist + Geist Mono) — theme/brand.ts. Data/logic bilkul same; sirf look + feel:
//  - Espresso "Today" hero: outlet + aaj ki sales (bada number), Sales report link (Owner)
//  - 2×2 stat tiles (explicit rows), ek calm style — rainbow colours hataye
//  - Quick actions ek line, ek style; "Inventory" ki jagah "QR code" (Inventory = stat tile)
//  - Recent orders: customer naam, time ago, status pill (dot + text, sirf rang nahi)
//  - Numbers: Geist tabular-nums (Geist Mono ka slashed-zero "dev tool" jaisa lagta tha)
//  - Motion (animate-expo skill): press = PressScale (0.97, 120ms, UI thread) + haptic;
//    screen khulne pe koi entrance/count-up NAHI (din mein dasiyon baar khulta hai);
//    sales number sirf LIVE badalne pe halka sa animate (LiveNumber)
//  - Bell icon hataya (kuch karta nahi tha)
//
// UI REFRESH (2026-10-11) — Vicky: "dashboard fika lag raha hai" (Klarna jaisa zinda, apne rang mein):
//  - Upar warm "latte" gradient wash (cream → roast light), header buttons uspe white glass jaise
//  - Hero mein LIVE SALES CURVE: aaj ki sales ghante-ghante judti hui (roast gold) vs kal (dashed)
//    — components/charts/SalesCurve.tsx. Manager ko ₹ nahi milta → orders ki curve (live list se)
//  - "This week" card: 7 din ke bars, aaj gold, last week se % (components/charts/WeekBars.tsx)
//  - Stat tiles pe halke rangeen icon chips (latte / sage / clay / sky) — sab warm, brand ke andar
//  - FIX: subah 0 sale pe "↓100% vs yesterday" (laal, darata tha) → "Yesterday by now: ₹X"
//  - Quick actions + Recent orders wahi (Vicky: "niche jo hai usse rehne dete hai")

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg'; // 2026-10-11: top wash
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
// ADDED (2026-10-17): Solo/Team ek baar poochna + online orders On/Paused
import { WorkModePicker } from '../../components/onboarding/WorkModePicker';
import { OnlineOrdersSwitch } from '../../components/orders/OnlineOrdersSwitch';
import { useOutletStore } from '../../features/organization/outlet.store';
import {
  AlertTriangle,
  ChevronRight,
  Settings,
  UtensilsCrossed,
  UserPlus,
  Armchair as TableIcon,
  Coffee,
  ShoppingBag,
  Truck,
  ShoppingCart,
  Users,
  Package,
  QrCode,
  TrendingUp,
  TrendingDown,
} from 'lucide-react-native';
import { analyticsApi, DailySummary, TodayCompare, HourlyPoint, SalesReport } from '../../features/analytics/analytics.api';
import { SalesCurve } from '../../components/charts/SalesCurve'; // ADDED (2026-10-11)
import { WeekBars } from '../../components/charts/WeekBars'; // ADDED (2026-10-11)
import type { OrderSummary } from '../../features/orders/orders.api';
import { useActiveOrders } from '../../features/orders/useActiveOrders';
import { inventoryApi, InventoryItem } from '../../features/inventory/inventory.api';
import { authApi } from '../../features/auth/auth.api';
import { tablesApi, tableTitle } from '../../features/tables/tables.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../lib/api-client';
import { PressScale } from '../../components/ui/PressScale';
import { LiveNumber } from '../../components/ui/LiveNumber';
import { formatINR } from '../../lib/format';
import { brand, font, radius, kds } from '../../theme/brand';

const ORDER_STATUS_META: Record<OrderSummary['orderStatus'], { label: string; color: string; bg: string }> = {
  PENDING: { label: 'New', color: brand.danger, bg: brand.dangerWash },
  PREPARING: { label: 'Preparing', color: brand.warning, bg: brand.warningWash },
  READY: { label: 'Ready', color: brand.success, bg: brand.successWash },
  SERVED: { label: 'Served', color: brand.muted, bg: brand.paper },
  CANCELLED: { label: 'Cancelled', color: brand.faint, bg: brand.paper },
};

const ORDER_TYPE_ICON: Record<OrderSummary['orderType'], React.ComponentType<{ size: number; color: string }>> = {
  DINE_IN: Coffee,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Truck,
};

export default function DashboardScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [summary, setSummary] = useState<DailySummary | null>(null);
  // ADDED (2026-10-09): hero pe "+12% vs this time yesterday" (Reports batch 1)
  const [compare, setCompare] = useState<TodayCompare | null>(null);
  // ADDED (2026-10-11): hero curve (aaj + kal ghante-wise) aur "This week" bars — Owner only
  const [hourlyToday, setHourlyToday] = useState<HourlyPoint[] | null>(null);
  const [hourlyYesterday, setHourlyYesterday] = useState<HourlyPoint[] | null>(null);
  const [week, setWeek] = useState<SalesReport | null>(null);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [staffInactive, setStaffInactive] = useState(0);
  const [tableStats, setTableStats] = useState({ occupied: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpiError, setKpiError] = useState<string | null>(null);
  // Sales analytics backend pe OWNER-only hai (PRD RBAC matrix)
  const isOwner = user?.role === 'OWNER';
  // ADDED (2026-10-17): null = Owner ne abhi "Just me / With staff" nahi chuna (purane cafe bhi)
  const workMode = useOutletStore((s) => s.workMode);

  // KPI numbers (revenue, staff, tables, stock) come from their own APIs.
  // FIX (2026-09-30): Promise.all → Promise.allSettled. Pehle ek bhi API fail hoti to
  // SAARE numbers chupchaap gayab ("Silent fail") — aur MANAGER ke liye analytics
  // hamesha 403 deta hai (owner-only), yaani har Manager ka dashboard poora khaali
  // dikhta tha! Ab har card apne data se independent hai, Manager ke liye analytics
  // call hi nahi hoti, aur sab fail ho to error banner + pull-to-refresh.
  const loadKpis = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [summaryRes, lowStockRes, staffRes, tablesRes] = await Promise.allSettled([
        isOwner ? analyticsApi.getDailySummary() : Promise.resolve(null),
        inventoryApi.getLowStockItems(),
        authApi.getStaffList(),
        tablesApi.getTables(),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value);
      // ADDED (2026-10-09): comparison sirf extra info hai — fail ho (jaise purana backend jisme
      // yeh route nahi) to chupchaap chhod do, "Some numbers couldn't load" banner NAHI.
      if (isOwner) analyticsApi.getTodayCompare().then(setCompare).catch(() => {});
      // ADDED (2026-10-11): graphs — sirf extra info, fail ho to graph nahi dikhta (banner nahi)
      if (isOwner) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yDate = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
        analyticsApi.getHourlySales().then(setHourlyToday).catch(() => {});
        analyticsApi.getHourlySales(yDate).then(setHourlyYesterday).catch(() => {});
        analyticsApi.getSalesReport(7).then(setWeek).catch(() => {});
      }
      if (lowStockRes.status === 'fulfilled') setLowStock(lowStockRes.value);
      if (staffRes.status === 'fulfilled') {
        setStaffCount(staffRes.value.filter((s) => s.isActive).length);
        setStaffInactive(staffRes.value.filter((s) => !s.isActive).length);
      }
      if (tablesRes.status === 'fulfilled') {
        setTableStats({ occupied: tablesRes.value.filter((t) => t.status === 'OCCUPIED').length, total: tablesRes.value.length });
      }
      const failed = [summaryRes, lowStockRes, staffRes, tablesRes].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      setKpiError(failed ? getErrorMessage(failed.reason) : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isOwner]);

  // Any order event (new order, status change, payment, void) means the KPI
  // numbers may have moved. Debounced so a burst of events = one refetch.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshKpisSoon = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadKpis(), 600);
  }, [loadKpis]);
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const { orders, refetch: refetchOrders } = useActiveOrders({ onEvent: refreshKpisSoon });

  useFocusEffect(
    useCallback(() => {
      loadKpis();
    }, [loadKpis])
  );

  // Everything below is derived from the live orders list, so it needs no
  // extra API call and can't go stale.
  const { recentOrders, inProgress, pendingPayment, todayCount, todayOrdersByHour } = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const today = orders.filter((o) => new Date(o.createdAt) >= startOfToday);
    return {
      recentOrders: [...orders]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3),
      inProgress: today.filter((o) => ['PENDING', 'PREPARING', 'READY'].includes(o.orderStatus)).length,
      pendingPayment: today
        .filter((o) => o.paymentStatus === 'UNPAID' && o.orderStatus !== 'CANCELLED')
        .reduce((sum, o) => sum + o.netAmount, 0),
      // Manager ke liye (analytics nahi milta) aaj ke orders live list se
      todayCount: today.filter((o) => o.orderStatus !== 'CANCELLED').length,
      // ADDED (2026-10-11): Manager ki curve — aaj ke orders ghante-wise (live list se, koi API nahi)
      todayOrdersByHour: today
        .filter((o) => o.orderStatus !== 'CANCELLED')
        .reduce((acc, o) => { acc[new Date(o.createdAt).getHours()] += 1; return acc; }, Array(24).fill(0) as number[]),
    };
  }, [orders]);

  const money = (n: number) => formatINR(n);

  if (loading) {
    // FIX (2026-09-30): spinner → dashboard ke shape ka skeleton
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Skeleton width={44} height={44} radius={22} />
            <View style={{ flex: 1 }}>
              <Skeleton width="45%" height={16} />
              <Skeleton width="25%" height={11} style={{ marginTop: 6 }} />
            </View>
          </View>
          <Skeleton height={150} radius={radius.xl} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton height={104} radius={radius.lg} style={{ flex: 1 }} />
            <Skeleton height={104} radius={radius.lg} style={{ flex: 1 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Skeleton height={104} radius={radius.lg} style={{ flex: 1 }} />
            <Skeleton height={104} radius={radius.lg} style={{ flex: 1 }} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const initialLetter = user?.name ? user.name.charAt(0).toUpperCase() : 'B';
  const orderCount = summary?.totalOrders ?? todayCount;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ADDED (2026-10-11): warm latte wash — screen ke upar, content iske upar scroll hota hai */}
      <View style={styles.wash} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="washV" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#EBD3AC" stopOpacity={1} />
              <Stop offset="0.55" stopColor="#F3E6D3" stopOpacity={1} />
              <Stop offset="1" stopColor={brand.paper} stopOpacity={1} />
            </LinearGradient>
            <RadialGradient id="washGlow" cx="85%" cy="8%" r="60%">
              <Stop offset="0" stopColor="#E9B9A2" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#E9B9A2" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#washV)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#washGlow)" />
        </Svg>
      </View>

      {/* ── Header ── */}
      <View style={styles.topHeader}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initialLetter}</Text>
        </View>
        <View style={styles.profileMeta}>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.userNameText} numberOfLines={1}>{user?.name ?? 'Owner'}</Text>
        </View>
        {/* UI REDESIGN (2026-10-08): bell hataya — kuch karta hi nahi tha (dead UI) */}
        <PressScale
          style={styles.iconBtn}
          onPress={() => router.push('/(admin)/settings')}
          accessibilityLabel="Settings"
          hitSlop={6}
        >
          <Settings size={20} color={brand.ink} />
        </PressScale>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { loadKpis(true); refetchOrders(); }}
            tintColor={brand.espresso}
            colors={[brand.espresso]}
          />
        }
      >
        {/* FIX (2026-09-30): KPI load fail hua to chupchaap zero nahi, saaf banner */}
        {kpiError && (
          <Pressable onPress={() => loadKpis(true)}>
            <ErrorBanner message={`Some numbers couldn't load — ${kpiError} Tap to retry.`} />
          </Pressable>
        )}

        {/* ADDED (2026-10-17): ek baar — "Just me" ya "With staff" (Settings se baad mein badal sakte hain) */}
        {isOwner && workMode === null && (
          <View style={{ marginBottom: 16 }}>
            <WorkModePicker />
          </View>
        )}

        {/* ADDED (2026-10-17): QR/website orders On / Paused */}
        <View style={{ marginBottom: 16 }}>
          <OnlineOrdersSwitch />
        </View>

        {/* ── Hero: Today ── */}
        <PressScale
          style={styles.hero}
          pressedScale={0.985}
          onPress={isOwner ? () => router.push('/(admin)/sales-report') : undefined}
          accessibilityLabel={isOwner ? "Today's sales. Open sales report" : undefined}
        >
          <View style={styles.heroGlow} pointerEvents="none" />

          <View style={styles.heroTopRow}>
            <View style={styles.outletRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.outletText} numberOfLines={1}>{user?.outletName ?? 'Your café'}</Text>
            </View>
            {isOwner && (
              <View style={styles.heroLink}>
                <Text style={styles.heroLinkText}>Reports</Text>
                <ChevronRight size={14} color={brand.roastLight} />
              </View>
            )}
          </View>

          <Text style={styles.heroLabel}>{isOwner ? "Today's sales" : "Today's orders"}</Text>
          <LiveNumber text={isOwner ? money(summary?.totalSales ?? 0) : String(orderCount)} style={styles.heroValue} />
          {/* ADDED (2026-10-09): FAIR comparison — aaj abhi tak vs kal ISI WAQT tak (poore din se nahi) */}
          {isOwner && compare && <HeroCompare compare={compare} />}

          {/* ADDED (2026-10-11): live curve — Owner ₹ (aaj vs kal), Manager orders */}
          <View style={styles.curveWrap}>
            {isOwner ? (
              hourlyToday ? (
                <SalesCurve
                  today={hourlyToday.map((h) => h.revenue)}
                  yesterday={hourlyYesterday ? hourlyYesterday.map((h) => h.revenue) : null}
                  nowHour={new Date().getHours()}
                  formatValue={money}
                />
              ) : (
                <View style={{ height: 92 }} />
              )
            ) : (
              <SalesCurve today={todayOrdersByHour} nowHour={new Date().getHours()} formatValue={(n) => `${n} orders`} />
            )}
            {isOwner && hourlyYesterday && (
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendSwatch, { backgroundColor: brand.roastLight }]} />
                  <Text style={styles.legendText}>Today</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendDots}>
                    {[0, 1, 2].map((d) => <View key={d} style={styles.legendDot} />)}
                  </View>
                  <Text style={styles.legendText}>Yesterday</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.heroFooter}>
            {isOwner && (
              <Text style={styles.heroFootText}>
                {orderCount} order{orderCount === 1 ? '' : 's'}
              </Text>
            )}
            {isOwner && <View style={styles.heroDot} />}
            <Text style={styles.heroFootText}>{inProgress > 0 ? `${inProgress} in progress` : 'All caught up'}</Text>
            {pendingPayment > 0 && (
              <>
                <View style={styles.heroDot} />
                <Text style={styles.heroFootGold}>{money(pendingPayment)} to collect</Text>
              </>
            )}
          </View>
        </PressScale>

        {/* ── Low stock ── */}
        {lowStock.length > 0 && (
          <PressScale style={styles.alertBanner} onPress={() => router.push('/(admin)/inventory')}>
            <AlertTriangle size={17} color={brand.warning} />
            <Text style={styles.alertText} numberOfLines={1}>
              <Text style={styles.alertTextBold}>{lowStock.length} item{lowStock.length === 1 ? '' : 's'} running low</Text>
              {' · '}{lowStock.map((i) => i.name).join(', ')}
            </Text>
            <ChevronRight size={16} color={brand.warning} />
          </PressScale>
        )}

        {/* ── Stats (2 × 2, explicit rows — percentage + gap wrapping galat tha) ── */}
        <View style={styles.statsRow}>
          <StatTile
            icon={ShoppingCart}
            label="Orders"
            value={String(orderCount)}
            sub={inProgress > 0 ? `${inProgress} in progress` : 'All caught up'}
            onPress={() => router.push('/(admin)/orders')}
            hue="latte"
          />
          <StatTile
            hue="sage"
            icon={TableIcon}
            label="Tables"
            value={String(tableStats.occupied)}
            valueSuffix={` / ${tableStats.total}`}
            sub={tableStats.total === 0 ? 'Add your tables' : `${tableStats.total - tableStats.occupied} free now`}
            onPress={() => router.push('/(admin)/tables')}
          />
        </View>
        <View style={[styles.statsRow, { marginBottom: isOwner && week ? 12 : 28 }]}>
          <StatTile
            hue="sky"
            icon={Users}
            label="Staff"
            value={String(staffCount)}
            sub={staffInactive > 0 ? `${staffInactive} inactive` : 'All active'}
            onPress={() => router.push('/(admin)/staff')}
          />
          <StatTile
            icon={Package}
            label="Low stock"
            value={String(lowStock.length)}
            sub={lowStock.length === 0 ? 'All stocked' : 'Restock soon'}
            tone={lowStock.length > 0 ? 'warning' : 'default'}
            onPress={() => router.push('/(admin)/inventory')}
            hue="clay"
          />
        </View>

        {/* ── ADDED (2026-10-11): This week (Owner) ── */}
        {isOwner && week && (
          <PressScale style={styles.weekCard} pressedScale={0.985} onPress={() => router.push('/(admin)/sales-report')} accessibilityLabel="This week's sales. Open reports">
            <View style={styles.weekHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.weekLabel}>This week</Text>
                <Text style={styles.weekValue}>{money(week.totals.revenue)}</Text>
              </View>
              <WeekDelta current={week.totals.revenue} previous={week.previous.revenue} />
            </View>
            <WeekBars series={week.series} formatValue={money} />
          </PressScale>
        )}

        {/* ── Quick actions ── */}
        <Text style={styles.sectionTitle}>Quick actions</Text>
        <View style={styles.quickRow}>
          <QuickAction icon={UtensilsCrossed} label="Add item" onPress={() => router.push('/(admin)/menu')} />
          <QuickAction icon={UserPlus} label="Add staff" onPress={() => router.push('/(admin)/staff/create')} />
          <QuickAction icon={TableIcon} label="Tables" onPress={() => router.push('/(admin)/tables')} />
          <QuickAction icon={QrCode} label="QR code" onPress={() => router.push('/(admin)/qr-code')} />
        </View>

        {/* ── Recent orders ── */}
        <View style={styles.recentHeaderRow}>
          <Text style={styles.sectionTitle}>Recent orders</Text>
          <Pressable hitSlop={10} style={styles.viewAllBtn} onPress={() => router.push('/(admin)/orders')}>
            <Text style={styles.viewAllText}>View all</Text>
            <ChevronRight size={15} color={brand.roastInk} />
          </Pressable>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Coffee size={22} color={brand.roastInk} />
            </View>
            <Text style={styles.emptyTitle}>No orders yet today</Text>
            <Text style={styles.emptySub}>Orders from billing and QR appear here the moment they're placed.</Text>
          </View>
        ) : (
          <View style={styles.listCard}>
            {recentOrders.map((order, i) => {
              const meta = ORDER_STATUS_META[order.orderStatus];
              const TypeIcon = ORDER_TYPE_ICON[order.orderType];
              return (
                <Pressable
                  key={order.id}
                  style={({ pressed }) => [
                    styles.orderRow,
                    i !== recentOrders.length - 1 && styles.orderRowDivider,
                    pressed && { backgroundColor: brand.paper },
                  ]}
                  onPress={() => router.push(`/(admin)/orders/${order.id}`)}
                >
                  <View style={styles.orderIconBox}>
                    <TypeIcon size={17} color={brand.espresso} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.orderTitle} numberOfLines={1}>
                      #{order.orderNumber}
                      {order.customerName ? ` · ${order.customerName}` : ''}
                    </Text>
                    <Text style={styles.orderMeta} numberOfLines={1}>
                      {order.table ? tableTitle(order.table.tableNumber) : typeLabel(order.orderType)} · {timeAgo(order.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.orderRight}>
                    <Text style={styles.orderAmount}>{money(order.netAmount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                      <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
                      <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  valueSuffix,
  sub,
  tone = 'default',
  onPress,
  hue = 'latte',
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  value: string;
  valueSuffix?: string;
  sub: string;
  tone?: 'default' | 'warning';
  onPress: () => void;
  hue?: keyof typeof HUES; // ADDED (2026-10-11)
}) {
  const warn = tone === 'warning';
  const h = warn ? { bg: brand.warningWash, fg: brand.warning } : HUES[hue];
  return (
    <PressScale style={styles.statTile} onPress={onPress} accessibilityLabel={`${label}: ${value}${valueSuffix ?? ''}. ${sub}`}>
      <View style={styles.statHead}>
        {/* UI REFRESH (2026-10-11): rangeen icon chip (warm tints) */}
        <View style={[styles.statChip, { backgroundColor: h.bg }]}>
          <Icon size={16} color={h.fg} />
        </View>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>
        {value}
        {valueSuffix ? <Text style={styles.statValueSuffix}>{valueSuffix}</Text> : null}
      </Text>
      <Text style={[styles.statSub, warn && { color: brand.warning }]} numberOfLines={1}>{sub}</Text>
    </PressScale>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale style={styles.quickAction} onPress={onPress} accessibilityLabel={label}>
      <View style={styles.quickIcon}>
        <Icon size={20} color={brand.espresso} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={1}>{label}</Text>
    </PressScale>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

function typeLabel(t: OrderSummary['orderType']): string {
  return t === 'DINE_IN' ? 'Dine-in' : t === 'DELIVERY' ? 'Delivery' : 'Takeaway';
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * ADDED (2026-10-09): Hero ke number ke neeche ek line — "▲ 12% vs this time yesterday".
 * Kal ka is waqt tak 0 tha (naya cafe / kal band) → pichle hafte ka same din try; woh bhi 0 → kuch nahi
 * (galat "+∞%" ya darane wala "-100%" kabhi nahi).
 */
function HeroCompare({ compare }: { compare: TodayCompare }) {
  const base = compare.yesterday.revenue > 0
    ? { prev: compare.yesterday.revenue, label: 'this time yesterday' }
    : compare.lastWeek.revenue > 0
      ? { prev: compare.lastWeek.revenue, label: 'this time last week' }
      : null;
  if (!base) return null;
  // FIX (2026-10-11): aaj abhi 0 hai → "−100%" (laal) darata hai, kuch batata nahi. Kal ka number do.
  if (compare.today.revenue === 0) {
    return (
      <View style={styles.heroCompare}>
        <Text style={styles.heroCompareLabel}>
          {base.label === 'this time yesterday' ? 'Yesterday by now' : 'Last week by now'}: {formatINR(base.prev)}
        </Text>
      </View>
    );
  }
  const pct = Math.round(((compare.today.revenue - base.prev) / base.prev) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? kds.green : kds.red;
  const pctText = Math.abs(pct) > 999 ? '999%+' : `${Math.abs(pct)}%`;
  return (
    <View style={styles.heroCompare} accessibilityLabel={`${up ? 'Up' : 'Down'} ${pctText} versus ${base.label}`}>
      <Icon size={14} color={color} />
      <Text style={[styles.heroCompareText, { color }]}>
        {pctText}
        <Text style={styles.heroCompareLabel}> vs {base.label}</Text>
      </Text>
    </View>
  );
}

/** ADDED (2026-10-11): stat tile chips — warm, muted tints (brand ke andar, rainbow nahi) */
const HUES = {
  latte: { bg: '#F5E6CC', fg: '#8B6320' },
  sage: { bg: '#E3EEE4', fg: '#3F6B4E' },
  clay: { bg: '#F6E1D8', fg: '#A2543A' },
  sky: { bg: '#E2EAF2', fg: '#3D5A80' },
} as const;

/** ADDED (2026-10-11): week card ka "+12% vs last week" pill */
function WeekDelta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? brand.success : brand.danger;
  return (
    <View style={[styles.weekDelta, { backgroundColor: up ? brand.successWash : brand.dangerWash }]}>
      <Icon size={13} color={color} />
      <Text style={[styles.weekDeltaText, { color }]}>
        {Math.abs(pct) > 999 ? '999%+' : `${Math.abs(pct)}%`} vs last week
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.paper },
  // ADDED (2026-10-11)
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  curveWrap: { marginTop: 14 },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 3, borderRadius: 2 },
  legendDots: { flexDirection: 'row', gap: 2, width: 14 },
  legendDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.5)' },
  legendText: { fontSize: 11, fontFamily: font.medium, color: 'rgba(255,255,255,0.6)' },
  weekCard: { backgroundColor: brand.card, borderRadius: radius.xl, borderWidth: 1, borderColor: brand.line, padding: 18, marginBottom: 28 },
  weekHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  weekLabel: { fontSize: 13, fontFamily: font.medium, color: brand.muted },
  weekValue: { fontSize: 24, lineHeight: 30, fontFamily: font.semibold, color: brand.ink, marginTop: 2, fontVariant: ['tabular-nums'] },
  weekDelta: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: radius.full },
  weekDeltaText: { fontSize: 12, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
  statChip: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 40 },

  // Header
  topHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  avatarCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: brand.espresso, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontFamily: font.semibold, color: brand.roastLight },
  profileMeta: { flex: 1, minWidth: 0 },
  greetingText: { fontSize: 13, fontFamily: font.regular, color: brand.muted },
  userNameText: { fontSize: 18, fontFamily: font.semibold, color: brand.ink, marginTop: 1 },
  // UI REFRESH (2026-10-11): wash ke upar halka "glass" (Klarna jaisa) — pura safed patch nahi
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },

  // Hero
  hero: { backgroundColor: brand.espresso, borderRadius: radius.xl, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 18, overflow: 'hidden', marginBottom: 12 },
  heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -90, top: -120, backgroundColor: 'rgba(192,138,46,0.16)' },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  outletRow: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ADE80' },
  outletText: { fontSize: 13, fontFamily: font.medium, color: 'rgba(255,255,255,0.72)', flexShrink: 1 },
  heroLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  heroLinkText: { fontSize: 13, fontFamily: font.semibold, color: brand.roastLight },
  heroLabel: { fontSize: 14, fontFamily: font.regular, color: 'rgba(255,255,255,0.6)', marginTop: 22 },
  heroValue: { fontSize: 36, lineHeight: 44, fontFamily: font.semibold, color: brand.white, marginTop: 2, ...NUM },
  heroFooter: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  heroFootText: { fontSize: 13, fontFamily: font.medium, color: 'rgba(255,255,255,0.78)', ...NUM },
  heroFootGold: { fontSize: 13, fontFamily: font.semibold, color: brand.roastLight, ...NUM },
  heroCompare: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }, // ADDED (2026-10-09)
  heroCompareText: { fontSize: 13, fontFamily: font.semibold, ...NUM },
  heroCompareLabel: { fontFamily: font.regular, color: 'rgba(255,255,255,0.7)' },
  heroDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },

  // Low stock
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: brand.warningWash, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  alertText: { flex: 1, fontSize: 13, fontFamily: font.regular, color: '#7A4A0E' },
  alertTextBold: { fontFamily: font.semibold },

  // Stats
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  // NOTE (2026-10-11): week card neeche aaya to stats ke aakhri row ka 28 margin → 12 (JSX mein)
  statTile: { flex: 1, backgroundColor: brand.card, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.line, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 14 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabel: { fontSize: 13, fontFamily: font.medium, color: brand.muted },
  statValue: { fontSize: 26, lineHeight: 32, fontFamily: font.semibold, color: brand.ink, marginTop: 10, ...NUM },
  statValueSuffix: { fontSize: 17, fontFamily: font.medium, color: brand.faint },
  statSub: { fontSize: 12, fontFamily: font.regular, color: brand.muted, marginTop: 2 },

  // Section titles
  sectionTitle: { fontSize: 16, fontFamily: font.semibold, color: brand.ink, marginBottom: 12 },

  // Quick actions
  quickRow: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  quickAction: { flex: 1, alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 12, borderRadius: radius.lg, backgroundColor: brand.card, borderWidth: 1, borderColor: brand.line },
  quickIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: brand.wash, justifyContent: 'center', alignItems: 'center' },
  quickLabel: { fontSize: 12, fontFamily: font.medium, color: brand.ink },

  // Recent
  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 12 },
  viewAllText: { fontSize: 13, fontFamily: font.semibold, color: brand.roastInk },
  emptyCard: { backgroundColor: brand.card, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.line, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center' },
  emptyIconCircle: { width: 48, height: 48, borderRadius: 16, backgroundColor: brand.wash, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 15, fontFamily: font.semibold, color: brand.ink },
  emptySub: { fontSize: 13, fontFamily: font.regular, color: brand.muted, textAlign: 'center', marginTop: 4, lineHeight: 19 },
  listCard: { backgroundColor: brand.card, borderRadius: radius.lg, borderWidth: 1, borderColor: brand.line, overflow: 'hidden' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  orderRowDivider: { borderBottomWidth: 1, borderBottomColor: brand.line },
  orderIconBox: { width: 38, height: 38, borderRadius: 12, backgroundColor: brand.wash, justifyContent: 'center', alignItems: 'center' },
  orderTitle: { fontSize: 15, fontFamily: font.semibold, color: brand.ink, ...NUM },
  orderMeta: { fontSize: 12, fontFamily: font.regular, color: brand.muted, marginTop: 2 },
  orderRight: { alignItems: 'flex-end', gap: 5 },
  orderAmount: { fontSize: 14, fontFamily: font.semibold, color: brand.ink, ...NUM },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontFamily: font.semibold },
});
