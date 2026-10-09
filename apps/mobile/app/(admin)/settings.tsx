// app/(admin)/settings.tsx
// USE CASE: Owner/Manager settings — account info, outlet details (editable), legal
// links, and the permanent Logout button. Header uses white background + blue accent
// (matches this app's newer, cleaner design direction — distinct from the dark-green
// headers used on Billing/Cart/KDS, which stay as-is for now).
// CONNECTED TO: auth.store.ts, organization.api.ts. Reached from Dashboard's settings icon.

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Store,
  MapPin,
  FileText,
  ShieldCheck,
  ShieldAlert,
  LogOut,
  ChevronRight,
  KeyRound,
  Trash2,
  QrCode,
  Star, // ADDED (2026-10-05): Reviews & Feedback
  BellRing, // ADDED (2026-10-09): QR order sound
} from 'lucide-react-native';
import { useAuthStore } from '../../features/auth/auth.store';
import { useQrAlertPrefs } from '../../features/orders/qr-alert-prefs'; // ADDED (2026-10-09)
import { organizationApi, OutletDetails } from '../../features/organization/organization.api';
import { theme } from '../../theme';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
const ACCENT = '#2B1F14';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [outlet, setOutlet] = useState<OutletDetails | null>(null);
  // ADDED (2026-10-09): QR order chime on/off — sirf is phone ke liye (owner ka personal phone)
  const qrSoundOn = useQrAlertPrefs((s) => s.soundOn);
  const setQrSoundOn = useQrAlertPrefs((s) => s.setSoundOn);
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
        <View style={{ width: 40 }} />
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
              {/* UI REDESIGN (2026-10-08): "OWNER" → "Owner" */}
              <Text style={styles.roleBadgeText}>{user?.role ? user.role.charAt(0) + user.role.slice(1).toLowerCase() : ''}</Text>
            </View>
          </View>
        </View>

        {/* Account section */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.card}>
          <InfoRow icon={User} label="Name" value={user?.name ?? '—'} />
          <View style={styles.divider} />
          <InfoRow icon={Mail} label="Email" value={user?.email ?? '—'} />
        </View>

        {/* Outlet section */}
        <Text style={styles.sectionLabel}>Outlet</Text>
        <View style={styles.card}>
          {loading ? (
            <ActivityIndicator color={ACCENT} style={{ padding: theme.spacing.lg }} />
          ) : (
            <>
              <InfoRow icon={Store} label="Outlet name" value={outlet?.name ?? '—'} />
              <View style={styles.divider} />
              <InfoRow icon={MapPin} label="Address" value={outlet?.address ?? '—'} />
              <View style={styles.divider} />
              <InfoRow icon={Phone} label="Phone" value={outlet?.phone ?? '—'} />
              {/* ADDED (2026-09-30): har cafe ka apna customer-ordering QR */}
              <View style={styles.divider} />
              <Pressable style={({ pressed }) => [styles.editRow, pressed && styles.rowPressed]} onPress={() => router.push('/(admin)/qr-code')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                  <QrCode size={17} color={ACCENT} />
                  <Text style={styles.editRowText}>QR code for ordering</Text>
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </Pressable>
              {/* ADDED (2026-10-05): Review Booster — Owner + Manager (backend bhi yahi enforce karta hai) */}
              {(user?.role === 'OWNER' || user?.role === 'MANAGER') && (
                <>
                  <View style={styles.divider} />
                  <Pressable style={({ pressed }) => [styles.editRow, pressed && styles.rowPressed]} onPress={() => router.push('/(admin)/reviews')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                      <Star size={17} color={ACCENT} />
                      <Text style={styles.editRowText}>Reviews & feedback</Text>
                    </View>
                    <ChevronRight size={16} color={theme.colors.textMuted} />
                  </Pressable>
                </>
              )}
              {user?.role === 'OWNER' && (
                <>
                  <View style={styles.divider} />
                  <Pressable style={({ pressed }) => [styles.editRow, pressed && styles.rowPressed]} onPress={() => router.push('/(admin)/outlet-edit')}>
                    <Text style={styles.editRowText}>Edit outlet details</Text>
                    <ChevronRight size={16} color={theme.colors.textMuted} />
                  </Pressable>
                </>
              )}
            </>
          )}
        </View>

        {/* ADDED (2026-10-09): Notifications — QR order aane pe chime. Per phone (counter wala
            phone ON, ghar wala OFF). OFF pe bhi banner + vibration aata hai, order miss nahi hota. */}
        <Text style={styles.sectionLabel}>Notifications</Text>
        <View style={styles.card}>
          <View style={styles.linkRow}>
            <BellRing size={17} color={theme.colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.linkRowText}>Sound for new QR orders</Text>
              <Text style={styles.rowHint}>This phone only. When off, you still get the banner and a vibration.</Text>
            </View>
            <Switch
              value={qrSoundOn}
              onValueChange={setQrSoundOn}
              trackColor={{ true: theme.colors.primary }}
              accessibilityLabel="Sound for new QR orders"
            />
          </View>
        </View>

        {/* Legal section */}
        <Text style={styles.sectionLabel}>Legal</Text>
        <View style={styles.card}>
          <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]} onPress={() => router.push('/legal/privacy')}>
            <FileText size={17} color={theme.colors.textSecondary} />
            <Text style={styles.linkRowText}>Privacy Policy</Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]} onPress={() => router.push('/legal/terms')}>
            <FileText size={17} color={theme.colors.textSecondary} />
            <Text style={styles.linkRowText}>Terms & Conditions</Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </Pressable>
        </View>

        {/* Reports — Owner only */}
        {user?.role === 'OWNER' && (
          <>
            <Text style={styles.sectionLabel}>Reports</Text>
            <View style={styles.card}>
              <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]} onPress={() => router.push('/(admin)/audit-logs')}>
                <ShieldAlert size={17} color={theme.colors.textSecondary} />
                <Text style={styles.linkRowText}>Audit logs</Text>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </Pressable>
            </View>
          </>
        )}

        {/* Security — FIX (2026-09-29): pehle yahan sirf ek "contact your Owner" alert
            tha (Owner khud ke liye kuch nahi kar sakta tha). Ab asli Change Password,
            aur Owner ke liye Delete Account (Google Play mandatory). */}
        <Text style={styles.sectionLabel}>Security</Text>
        <View style={styles.card}>
          <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]} onPress={() => router.push('/(admin)/change-password')}>
            <KeyRound size={17} color={theme.colors.textSecondary} />
            <Text style={styles.linkRowText}>Change password</Text>
            <ChevronRight size={16} color={theme.colors.textMuted} />
          </Pressable>
          {user?.role === 'OWNER' && (
            <>
              <View style={styles.divider} />
              <Pressable style={({ pressed }) => [styles.linkRow, pressed && styles.rowPressed]} onPress={() => router.push('/(admin)/delete-account')}>
                <Trash2 size={17} color={theme.colors.danger} />
                <Text style={[styles.linkRowText, { color: theme.colors.danger }]}>Delete account</Text>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </Pressable>
            </>
          )}
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
  // UI REDESIGN (2026-10-08): row dabane pe halka background — tap mehsoos ho
  rowPressed: { backgroundColor: theme.colors.background },
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg, marginBottom: theme.spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: theme.radius.full, backgroundColor: ACCENT, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  avatarText: { fontSize: 22, fontFamily: theme.typography.font.bold, color: '#FFFFFF' },
  profileName: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.colors.primaryLight, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.radius.full, marginTop: 4 },
  roleBadgeText: { fontSize: 11, fontFamily: theme.typography.font.bold, color: ACCENT },

  sectionLabel: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm, marginTop: theme.spacing.lg }, // UI REDESIGN (2026-10-08): ALL-CAPS + tracking → sentence case (padhne mein aasaan)
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: theme.colors.border },

  infoRow: { flexDirection: 'row', alignItems: 'center', padding: theme.spacing.md },
  infoLabel: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  infoValue: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary, marginTop: 1 },

  editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.md },
  editRowText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: ACCENT },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md },
  rowHint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: 2, lineHeight: 16 }, // ADDED (2026-10-09)
  linkRowText: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },

  logoutButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.md, paddingVertical: theme.spacing.md, marginTop: theme.spacing.xl },
  logoutText: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.danger },

  versionText: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.lg },
});