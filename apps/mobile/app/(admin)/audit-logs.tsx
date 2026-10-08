// app/(admin)/audit-logs.tsx
// USE CASE: Owner-only "Zero-Theft" audit screen — who voided/discounted/changed what,
// exactly who cancelled what order and why, at a glance.
// CONNECTED TO: audit.api.ts. Reached from settings.tsx or Dashboard (Owner only).
//
// UI/UX PASS (2026-09-30):
//  - Backend ab 5 action types likhta hai (CANCEL_ORDER, APPLY_DISCOUNT, PRICE_CHANGE,
//    DELETE_ITEM, RESET_STAFF_PASSWORD) — pehle screen sirf "Order Voided" samajhti thi,
//    baaki raw code (e.g. "APPLY_DISCOUNT") bina detail ke dikhte. Ab har type ka apna
//    label, icon aur 1-line summary (kitna discount, purana → naya price, refund, etc.)
//  - Filter chips: All / Voids / Discounts / Menu / Staff
//  - useScreenLoad: skeleton, error + retry, pull-to-refresh

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, ShieldAlert, XCircle, BadgePercent, Tag, Trash2, KeyRound, type LucideIcon } from 'lucide-react-native';
import { useAuthStore } from '../../features/auth/auth.store';
import { auditApi, AuditLogEntry } from '../../features/audit/audit.api';
import { useScreenLoad } from '../../lib/use-screen-load';
import { SkeletonList } from '../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { theme } from '../../theme';

import { formatINR } from '../../lib/format';
import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
type Filter = 'ALL' | 'VOID' | 'DISCOUNT' | 'MENU' | 'STAFF';

interface ActionMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  filter: Exclude<Filter, 'ALL'>;
}

const ACTION_META: Record<string, ActionMeta> = {
  CANCEL_ORDER: { label: 'Order Voided', icon: XCircle, color: theme.colors.danger, bg: theme.colors.dangerLight, filter: 'VOID' },
  APPLY_DISCOUNT: { label: 'Discount Given', icon: BadgePercent, color: theme.colors.warning, bg: theme.colors.warningLight, filter: 'DISCOUNT' },
  PRICE_CHANGE: { label: 'Price Changed', icon: Tag, color: theme.colors.primary, bg: theme.colors.primaryLight, filter: 'MENU' },
  DELETE_ITEM: { label: 'Item Deleted', icon: Trash2, color: theme.colors.danger, bg: theme.colors.dangerLight, filter: 'MENU' },
  RESET_STAFF_PASSWORD: { label: 'Staff Password Reset', icon: KeyRound, color: theme.colors.textSecondary, bg: theme.colors.background, filter: 'STAFF' },
};

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'VOID', label: 'Voids' },
  { key: 'DISCOUNT', label: 'Discounts' },
  { key: 'MENU', label: 'Menu' },
  { key: 'STAFF', label: 'Staff' },
];

const rupees = (v: unknown) => (typeof v === 'number' ? formatINR(v) : ''); // UI REDESIGN (2026-10-08): ₹1,250 format

/** Har action ka title (+ order/item) aur ek-line detail metadata se */
function describe(entry: AuditLogEntry): { title: string; detail?: string; quote?: string } {
  const m = (entry.metadata ?? {}) as Record<string, unknown>;
  const meta = ACTION_META[entry.action];
  const label = meta?.label ?? entry.action;

  switch (entry.action) {
    case 'CANCEL_ORDER':
      return {
        title: `${label}${m.orderNumber ? ` #${m.orderNumber}` : ''}`,
        detail: m.wasPaid ? `Was paid — ${rupees(m.netAmount)} refunded` : m.netAmount ? `Bill ${rupees(m.netAmount)} (unpaid)` : undefined,
        quote: typeof m.reason === 'string' ? m.reason : undefined,
      };
    case 'APPLY_DISCOUNT':
      return {
        title: `${label}${m.orderNumber ? ` · #${m.orderNumber}` : ''}`,
        detail: `${rupees(m.discountAmount)} off ${rupees(m.grossAmount)} → ${rupees(m.netAmount)}${m.paymentMethod ? ` · ${m.paymentMethod}` : ''}`,
      };
    case 'PRICE_CHANGE': {
      const priceMoved = m.oldPrice !== m.newPrice;
      const taxMoved = m.oldTaxRate !== m.newTaxRate;
      return {
        title: `${label}${m.productName ? ` · ${m.productName}` : ''}`,
        detail: [
          priceMoved ? `${rupees(m.oldPrice)} → ${rupees(m.newPrice)}` : '',
          taxMoved ? `GST ${m.oldTaxRate}% → ${m.newTaxRate}%` : '',
        ].filter(Boolean).join(' · '),
      };
    }
    case 'DELETE_ITEM':
      return { title: `${label}${m.productName ? ` · ${m.productName}` : ''}`, detail: m.price ? `Price was ${rupees(m.price)}` : undefined };
    case 'RESET_STAFF_PASSWORD':
      return { title: label, detail: m.role ? `For a ${String(m.role).toLowerCase()} account` : undefined };
    default:
      return { title: label };
  }
}

export default function AuditLogsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [filter, setFilter] = useState<Filter>('ALL');

  const { loading, refreshing, error, refresh, retry } = useScreenLoad(async () => {
    if (user?.role !== 'OWNER') return;
    setLogs(await auditApi.getLogs());
  });

  const visibleLogs = useMemo(
    () => (filter === 'ALL' ? logs : logs.filter((l) => ACTION_META[l.action]?.filter === filter)),
    [logs, filter]
  );

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  // Owner-only screen — Manager/Cashier/Chef should never reach this via normal
  // navigation, but this guard protects against a deep-link or stale UI state
  if (user?.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ShieldAlert size={32} color={theme.colors.textMuted} />
          <Text style={styles.restrictedText}>Only the Owner can view audit logs</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Audit logs</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.subHeader}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <Pressable key={f.key} style={[styles.chip, active && styles.chipActive]} onPress={() => setFilter(f.key)}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <SkeletonList count={6} trailing={false} />
      ) : error && logs.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={visibleLogs}
          keyExtractor={(l) => l.id}
          contentContainerStyle={[styles.listContent, visibleLogs.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={ShieldAlert}
              title={filter === 'ALL' ? 'No flagged actions yet' : 'Nothing here'}
              message={
                filter === 'ALL'
                  ? 'Voids, discounts, price changes and deleted items will show up here — so you always know who did what.'
                  : 'No actions of this type so far.'
              }
            />
          }
          renderItem={({ item }) => {
            const meta = ACTION_META[item.action] ?? { label: item.action, icon: ShieldAlert, color: theme.colors.textSecondary, bg: theme.colors.background };
            const { title, detail, quote } = describe(item);
            const Icon = meta.icon;

            return (
              <View style={styles.logCard}>
                <View style={[styles.iconBox, { backgroundColor: meta.bg }]}>
                  <Icon size={18} color={meta.color} />
                </View>
                <View style={styles.logTextWrap}>
                  <View style={styles.logTopRow}>
                    <Text style={styles.logAction} numberOfLines={2}>{title}</Text>
                    <Text style={styles.logTime}>{formatDate(item.timestamp)}</Text>
                  </View>
                  {!!detail && <Text style={styles.logDetail}>{detail}</Text>}
                  <Text style={styles.logUser}>
                    by {item.user.name} · <Text style={styles.logRole}>{item.user.role}</Text>
                  </Text>
                  {!!quote && <Text style={styles.logReason}>"{quote}"</Text>}
                </View>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, gap: theme.spacing.sm },
  restrictedText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, textAlign: 'center' },

  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },

  subHeader: { backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  chipRow: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm },
  chip: { paddingHorizontal: theme.spacing.md, paddingVertical: 6, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.white },

  listContent: { padding: theme.spacing.lg, gap: theme.spacing.md },
  logCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  iconBox: { width: 40, height: 40, borderRadius: theme.radius.md, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  logTextWrap: { flex: 1 },
  logTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logAction: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing.sm },
  logTime: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  logDetail: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary, marginTop: 4 },
  logUser: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4 },
  logRole: { fontFamily: theme.typography.font.semibold, color: theme.colors.textMuted },
  logReason: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 4 },
});
