// app/(admin)/audit-logs.tsx
// USE CASE: Owner-only screen showing high-risk staff actions (order voids, discounts).
// This is what actually delivers the PRD's "Zero-Theft Audit" promise — Owner can see
// exactly who cancelled what order and why, at a glance.
// CONNECTED TO: audit.api.ts. Reached from settings.tsx or Dashboard (Owner only).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, ShieldAlert, XCircle } from 'lucide-react-native';
import { useAuthStore } from '../../features/auth/auth.store';
import { auditApi, AuditLogEntry } from '../../features/audit/audit.api';
import { theme } from '../../theme';

const ACTION_META: Record<string, { label: string; icon: React.ComponentType<{ size: number; color: string }>; color: string; bg: string }> = {
  CANCEL_ORDER: { label: 'Order Voided', icon: XCircle, color: theme.colors.danger, bg: theme.colors.dangerLight },
};

export default function AuditLogsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await auditApi.getLogs();
      setLogs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
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
        <Text style={styles.headerTitle}>Audit Logs</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.subHeader}>
        <ShieldAlert size={14} color={theme.colors.textMuted} />
        <Text style={styles.subHeaderText}>High-risk actions across your outlet</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : logs.length === 0 ? (
        <View style={styles.centerFill}>
          <View style={styles.emptyIconBadge}>
            <ShieldAlert size={26} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyText}>No flagged actions yet</Text>
          <Text style={styles.emptySubtext}>Order voids and other high-risk actions will show up here</Text>
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const meta = ACTION_META[item.action] ?? { label: item.action, icon: ShieldAlert, color: theme.colors.textSecondary, bg: theme.colors.background };
            const orderNumber = item.metadata?.orderNumber as number | undefined;
            const reason = item.metadata?.reason as string | undefined;

            return (
              <View style={styles.logCard}>
                <View style={[styles.iconBox, { backgroundColor: meta.bg }]}>
                  <meta.icon size={18} color={meta.color} />
                </View>
                <View style={styles.logTextWrap}>
                  <View style={styles.logTopRow}>
                    <Text style={styles.logAction}>{meta.label}{orderNumber ? ` #${orderNumber}` : ''}</Text>
                    <Text style={styles.logTime}>{formatDate(item.timestamp)}</Text>
                  </View>
                  <Text style={styles.logUser}>
                    {item.user.name} · <Text style={styles.logRole}>{item.user.role}</Text>
                  </Text>
                  {reason && <Text style={styles.logReason}>"{reason}"</Text>}
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
  restrictedText: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted, textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: { width: 38, height: 38, borderRadius: theme.radius.full, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },

  subHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  subHeaderText: { fontSize: 12, color: theme.colors.textMuted },

  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  emptyText: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  emptySubtext: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },

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
  logAction: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, flex: 1, marginRight: theme.spacing.sm },
  logTime: { fontSize: 11, color: theme.colors.textMuted },
  logUser: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  logRole: { fontWeight: theme.typography.weight.semibold, color: theme.colors.textMuted },
  logReason: { fontSize: 12, color: theme.colors.textMuted, fontStyle: 'italic', marginTop: 4 },
});