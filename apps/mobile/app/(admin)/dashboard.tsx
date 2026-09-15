// app/(admin)/dashboard.tsx
// USE CASE: Executive Owner/Manager POS Dashboard Screen
// CONNECTED TO: analytics.api.ts, orders.api.ts, inventory.api.ts, auth.api.ts, tables.api.ts

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowRight,
  AlertTriangle,
  ChevronRight,
  Settings,
  Bell,
  UtensilsCrossed,
  UserPlus,
  Armchair as TableIcon,
  Coffee,
  ShoppingBag,
  Truck,
  ShoppingCart,
  Users,
  Clock,
  BarChart3,
} from 'lucide-react-native';
import { analyticsApi, DailySummary } from '../../features/analytics/analytics.api';
import { ordersApi, OrderSummary } from '../../features/orders/orders.api';
import { inventoryApi, InventoryItem } from '../../features/inventory/inventory.api';
import { authApi } from '../../features/auth/auth.api';
import { tablesApi } from '../../features/tables/tables.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { theme } from '../../theme';

const ORDER_STATUS_META: Record<OrderSummary['orderStatus'], { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Pending', color: theme.colors.danger, bg: theme.colors.dangerLight },
  PREPARING: { label: 'Preparing', color: theme.colors.warning, bg: theme.colors.warningLight },
  READY: { label: 'Ready', color: theme.colors.success, bg: theme.colors.successLight },
  SERVED: { label: 'Served', color: theme.colors.textMuted, bg: theme.colors.background },
  CANCELLED: { label: 'Cancelled', color: theme.colors.textMuted, bg: theme.colors.background },
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
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [tableStats, setTableStats] = useState({ occupied: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const [summaryRes, ordersRes, lowStockRes, staffRes, tablesRes] = await Promise.all([
        analyticsApi.getDailySummary(),
        ordersApi.getOrders(),
        inventoryApi.getLowStockItems(),
        authApi.getStaffList(),
        tablesApi.getTables(),
      ]);
      setSummary(summaryRes);
      setRecentOrders(ordersRes.slice(0, 3));
      setLowStock(lowStockRes);
      setStaffCount(staffRes.filter((s) => s.isActive).length);
      setTableStats({ occupied: tablesRes.filter((t) => t.status === 'OCCUPIED').length, total: tablesRes.length });
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#1E3E2B" />
        </View>
      </SafeAreaView>
    );
  }

  const initialLetter = user?.name ? user.name.charAt(0).toUpperCase() : 'V';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ── Top Header Bar ── */}
      <View style={styles.topHeader}>
        <View style={styles.headerProfileRow}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{initialLetter}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            <Text style={styles.userNameText} numberOfLines={1}>{user?.name ?? 'Vicky Sahu'}</Text>
            <View style={styles.outletBadgeRow}>
              <View style={styles.onlineDot} />
              <Text style={styles.outletNameText}>{user?.outletName ?? 'NBC - Surat'}</Text>
              <Text style={styles.dotDivider}>•</Text>
              <Text style={styles.roleText}>{user?.role ?? 'Owner'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <Pressable 
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]} 
            onPress={() => router.push('/(admin)/settings')}
          >
            <Settings size={18} color="#334155" />
          </Pressable>
          <Pressable style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Bell size={18} color="#334155" />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={() => load(true)} 
            tintColor="#1E3E2B" 
          />
        }
      >
        {/* ── Low Stock Alert Banner ── */}
        {lowStock.length > 0 && (
          <Pressable 
            style={({ pressed }) => [styles.alertBanner, pressed && styles.pressed]} 
            onPress={() => router.push('/(admin)/inventory')}
          >
            <View style={styles.alertIconBox}>
              <AlertTriangle size={15} color="#D97706" />
            </View>
            <Text style={styles.alertText} numberOfLines={1}>
              <Text style={styles.alertTextBold}>{lowStock.length} items low </Text>
              — {lowStock.map((i) => i.name).join(', ')}
            </Text>
            <ChevronRight size={16} color="#D97706" />
          </Pressable>
        )}

        {/* ── Executive Overview Card (Bina Image ke, Premium Dark Banner) ── */}
        <View style={styles.overviewContainer}>
          <View style={styles.darkBannerHeader}>
            <View style={styles.bannerTitleRow}>
              <BarChart3 size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.bannerTitle}>Executive Overview</Text>
            </View>
            <Text style={styles.bannerSubtitle}>Here's what's happening with your cafe today.</Text>
          </View>

          {/* 4 Stats Grid */}
          <View style={styles.statsCardGrid}>
            {/* Cell 1: Total Orders */}
            <Pressable style={styles.statCell}>
              <View style={styles.statCellTop}>
                <View style={[styles.statIconBox, { backgroundColor: '#E6F4EA' }]}>
                  <ShoppingCart size={18} color="#1E8E3E" />
                </View>
                <ChevronRight size={14} color="#94A3B8" />
              </View>
              <Text style={styles.statCellLabel}>Total Orders</Text>
              <Text style={styles.statCellValue}>{summary?.totalOrders ?? 0}</Text>
              <Text style={styles.statComparison}>— 0% vs yesterday</Text>
            </Pressable>

            <View style={styles.cellDividerVertical} />

            {/* Cell 2: Net Revenue */}
            <Pressable style={styles.statCell}>
              <View style={styles.statCellTop}>
                <View style={[styles.statIconBox, { backgroundColor: '#E6F4EA' }]}>
                  <Text style={styles.rupeeIconText}>₹</Text>
                </View>
                <ChevronRight size={14} color="#94A3B8" />
              </View>
              <Text style={styles.statCellLabel}>Net Revenue</Text>
              <Text style={styles.statCellValue}>₹{summary?.totalSales ?? 0}</Text>
              <Text style={styles.statComparison}>— 0% vs yesterday</Text>
            </Pressable>
          </View>

          <View style={styles.cellDividerHorizontal} />

          <View style={styles.statsCardGrid}>
            {/* Cell 3: Active Staff */}
            <Pressable style={styles.statCell}>
              <View style={styles.statCellTop}>
                <View style={[styles.statIconBox, { backgroundColor: '#FCE8E6' }]}>
                  <Users size={18} color="#D93025" />
                </View>
                <ChevronRight size={14} color="#94A3B8" />
              </View>
              <Text style={styles.statCellLabel}>Active Staff</Text>
              <Text style={styles.statCellValue}>{staffCount}</Text>
              <Text style={styles.statComparison}>— 0% vs yesterday</Text>
            </Pressable>

            <View style={styles.cellDividerVertical} />

            {/* Cell 4: Tables Occupied */}
            <Pressable style={styles.statCell}>
              <View style={styles.statCellTop}>
                <View style={[styles.statIconBox, { backgroundColor: '#E8F0FE' }]}>
                  <TableIcon size={18} color="#1A73E8" />
                </View>
                <ChevronRight size={14} color="#94A3B8" />
              </View>
              <Text style={styles.statCellLabel}>Tables Occupied</Text>
              <Text style={styles.statCellValue}>
                {tableStats.occupied}
                <Text style={{ fontSize: 16, color: '#94A3B8', fontWeight: '500' }}>/{tableStats.total}</Text>
              </Text>
              <Text style={styles.statComparison}>— 0% vs yesterday</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <View style={styles.sectionTitleBox}>
          <Text style={styles.sectionMainTitle}>Quick Actions</Text>
          <Text style={styles.sectionSubTitle}>Manage your cafe with ease</Text>
        </View>

        <View style={styles.quickActionsRow}>
          {/* Add Item Card */}
          <Pressable 
            style={({ pressed }) => [styles.actionCard, { backgroundColor: '#F0F9F4' }, pressed && styles.pressed]}
            onPress={() => router.push('/(admin)/menu')}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#DCFCE7' }]}>
              <UtensilsCrossed size={18} color="#166534" />
            </View>
            <Text style={styles.actionCardTitle}>Add Item</Text>
            <Text style={styles.actionCardSub}>Update your menu</Text>
            <View style={[styles.actionArrowBtn, { backgroundColor: '#166534' }]}>
              <ArrowRight size={12} color="#FFFFFF" />
            </View>
          </Pressable>

          {/* Add Staff Card */}
          <Pressable 
            style={({ pressed }) => [styles.actionCard, { backgroundColor: '#FFF7ED' }, pressed && styles.pressed]}
            onPress={() => router.push('/(admin)/staff/create')}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#FFEDD5' }]}>
              <UserPlus size={18} color="#C2410C" />
            </View>
            <Text style={styles.actionCardTitle}>Add Staff</Text>
            <Text style={styles.actionCardSub}>Manage your team</Text>
            <View style={[styles.actionArrowBtn, { backgroundColor: '#EA580C' }]}>
              <ArrowRight size={12} color="#FFFFFF" />
            </View>
          </Pressable>

          {/* Add Table Card */}
          <Pressable 
            style={({ pressed }) => [styles.actionCard, { backgroundColor: '#EFF6FF' }, pressed && styles.pressed]}
            onPress={() => router.push('/(admin)/tables')}
          >
            <View style={[styles.actionIconCircle, { backgroundColor: '#DBEAFE' }]}>
              <TableIcon size={18} color="#1E40AF" />
            </View>
            <Text style={styles.actionCardTitle}>Add Table</Text>
            <Text style={styles.actionCardSub}>Set up your tables</Text>
            <View style={[styles.actionArrowBtn, { backgroundColor: '#2563EB' }]}>
              <ArrowRight size={12} color="#FFFFFF" />
            </View>
          </Pressable>
        </View>

        {/* ── Recent Activity ── */}
        <View style={styles.recentHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Clock size={16} color="#0F172A" />
            <Text style={styles.sectionMainTitle}>Recent Activity</Text>
          </View>
          <Pressable 
            style={({ pressed }) => [styles.viewAllBtn, pressed && styles.pressed]} 
            onPress={() => router.push('/(cashier)/orders')}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <ArrowRight size={12} color="#64748B" />
          </Pressable>
        </View>

        {recentOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Coffee size={24} color="#94A3B8" />
            </View>
            <Text style={styles.emptyTitle}>No activity recorded today yet</Text>
            <Text style={styles.emptySub}>
              Once you get orders, staff actions or table bookings, they will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.orderListCard}>
            {recentOrders.map((order, i) => {
              const meta = ORDER_STATUS_META[order.orderStatus];
              const TypeIcon = ORDER_TYPE_ICON[order.orderType];
              return (
                <Pressable
                  key={order.id}
                  style={({ pressed }) => [
                    styles.orderItemRow,
                    i !== recentOrders.length - 1 && styles.orderItemDivider,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => router.push('/(cashier)/orders')}
                >
                  <View style={styles.orderIconBox}>
                    <TypeIcon size={16} color="#334155" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                    <Text style={styles.orderMeta}>
                      {order.table ? `Table ${order.table.tableNumber}` : order.orderType.replace('_', ' ')}
                    </Text>
                  </View>
                  <Text style={styles.orderAmount}>₹{order.netAmount}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 22) return 'Good Evening';
  return 'Good Night';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F6F0' }, // Off-white warm theme background like screenshot
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  pressed: { opacity: 0.75 },

  // ── Header Bar ──────────────────────────────────────────────
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F6F0',
  },
  headerProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E3E2B', // Dark forest green
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  profileMeta: { justifyContent: 'center' },
  greetingText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  userNameText: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginTop: 1 },
  outletBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  outletNameText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  dotDivider: { fontSize: 12, color: '#94A3B8' },
  roleText: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },

  // ── Low Stock Banner ────────────────────────────────────────
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEFCE8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FEF08A',
  },
  alertIconBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FEF08A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertText: { flex: 1, fontSize: 12, color: '#854D0E' },
  alertTextBold: { fontWeight: '700' },

  // ── Executive Overview Dark Card (Without Image) ────────────
  overviewContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  darkBannerHeader: {
    backgroundColor: '#1E3E2B', // Premium dark green from image
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  bannerSubtitle: { fontSize: 12, color: '#A7F3D0', marginTop: 4, fontWeight: '400' },
  statsCardGrid: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 12 },
  statCell: { flex: 1, paddingHorizontal: 8 },
  statCellTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rupeeIconText: { fontSize: 15, fontWeight: '700', color: '#1E8E3E' },
  statCellLabel: { fontSize: 12, color: '#475569', fontWeight: '600' },
  statCellValue: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  statComparison: { fontSize: 10, color: '#94A3B8', marginTop: 4, fontWeight: '500' },
  cellDividerVertical: { width: 1, backgroundColor: '#F1F5F9', marginVertical: 4 },
  cellDividerHorizontal: { height: 1, backgroundColor: '#F1F5F9', marginHorizontal: 16 },

  // ── Quick Actions ───────────────────────────────────────────
  sectionTitleBox: { marginBottom: 12 },
  sectionMainTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  sectionSubTitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  quickActionsRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  actionCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    position: 'relative',
    height: 124,
    justifyContent: 'flex-start',
  },
  actionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionCardTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  actionCardSub: { fontSize: 10, color: '#64748B', marginTop: 2 },
  actionArrowBtn: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Recent Activity ─────────────────────────────────────────
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewAllText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  emptySub: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 4, lineHeight: 16 },
  orderListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  orderItemRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  orderItemDivider: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  orderIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  orderNumber: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  orderMeta: { fontSize: 11, color: '#64748B', marginTop: 1 },
  orderAmount: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginRight: 10 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
});