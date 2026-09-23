// app/(admin)/settings.tsx
// USE CASE: Owner/Manager settings — account info, outlet details (editable), legal
// links, and the permanent Logout button. Header uses white background + blue accent
// (matches this app's newer, cleaner design direction — distinct from the dark-green
// headers used on Billing/Cart/KDS, which stay as-is for now).
// CONNECTED TO: auth.store.ts, organization.api.ts. Reached from Dashboard's settings icon.

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, User, Mail, Phone, Store, MapPin, FileText, ShieldCheck, LogOut, ChevronRight, HelpCircle } from 'lucide-react-native';
import { useAuthStore } from '../../features/auth/auth.store';
import { organizationApi, OutletDetails } from '../../features/organization/organization.api';
import { theme } from '../../theme';

const ACCENT = '#2563EB';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [outlet, setOutlet] = useState<OutletDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      organizationApi.getOutlet().then(setOutlet).catch(() => {}).finally(() => setLoading(false));
    }, [])
  );

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  };

  const initials = user?.name ? user.name.charAt(0).toUpperCase() : '?';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user?.name}</Text>
            <View style={styles.roleBadge}>
              <ShieldCheck size={11} color={ACCENT} />
              <Text style={styles.roleBadgeText}>{user?.role}</Text>
            </View>
          </View>
        </View>

        {/* Account section */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <InfoRow icon={User} label="Name" value={user?.name ?? '—'} />
          <View style={styles.divider} />
          <InfoRow icon={Mail} label="Email" value={user?.email ?? '—'} />
        </View>

        {/* Outlet section */}
        <Text style={styles.sectionLabel}>OUTLET</Text>
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ padding: theme.spacing.lg }} />
          ) : (
            <>
              <InfoRow icon={Store} label="Outlet Name" value={outlet?.name ?? '—'} />
              <View style={styles.divider} />
              <InfoRow icon={MapPin} label="Address" value={outlet?.address ?? '—'} />
              <View style={styles.divider} />
              <InfoRow icon={Phone} label="Phone" value={outlet?.phone ?? '—'} />
              {user?.role === 'OWNER' && (
                <>
                  <View style={styles.divider} />
                  <Pressable style={styles.editRow} onPress={() => router.push('/(admin)/outlet-edit')}>
                    <Text style={styles.editRowText}>Edit Outlet Details</Text>
                    <ChevronRight size={16} color={theme.colors.textMuted} />
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>

        {/* Legal section */}
        <Text style={styles.sectionLabel}>LEGAL</Text>
        <View style={styles.card}>
          <Pressable style={styles.linkRow} onPress={() => router.push('/(admin)/legal/privacy')}>
            <FileText size={17} color={theme.colors.textSecondary} />
            <Text style={styles.linkRowText}>Privacy Policy</Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={styles.linkRow} onPress={() => router.push('/(admin)/legal/terms')}>
            <FileText size={17} color={theme.colors.textSecondary} />
            <Text style={styles.linkRowText}>Terms & Conditions</Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        {/* Support */}
        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.card}>
          <Pressable
            style={styles.linkRow}
            onPress={() => Alert.alert('Forgot your password?', 'Please contact your outlet Owner to reset your password.')}
          >
            <HelpCircle size={17} color={theme.colors.textSecondary} />
            <Text style={styles.linkRowText}>Forgot Password?</Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        {/* Logout */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={17} color={theme.colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>

        <Text style={styles.versionText}>BillRaw v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ size: number; color: string }>; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Icon size={17} color={theme.colors.textSecondary} />
      <View style={{ flex: 1, marginLeft: theme.spacing.sm }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background, // light grey circle, visible on white header
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg, marginBottom: theme.spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: theme.radius.full, backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  avatarText: { fontSize: 22, fontWeight: theme.typography.weight.bold, color: '#FFFFFF' },
  profileName: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primaryLight, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full, marginTop: 4 },
  roleBadgeText: { fontSize: 10, fontWeight: theme.typography.weight.bold, color: ACCENT },

  sectionLabel: { fontSize: 12, fontWeight: theme.typography.weight.bold, color: theme.colors.textMuted, letterSpacing: 0.6, marginBottom: theme.spacing.sm, marginTop: theme.spacing.md },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: theme.colors.border },

  infoRow: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.md },
  infoLabel: { fontSize: 11, color: theme.colors.textMuted },
  infoValue: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary, marginTop: 1 },

  editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md },
  editRowText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: ACCENT },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md },
  linkRowText: { flex: 1, fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium, color: theme.colors.textPrimary },

  logoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.md, paddingVertical: theme.spacing.md, marginTop: theme.spacing.xl },
  logoutText: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.danger },

  versionText: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
});