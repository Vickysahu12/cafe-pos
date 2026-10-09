// app/(admin)/staff/index.tsx
// USE CASE: Team/staff list — Owner/Manager manages Cashier, Chef, Manager accounts here.
//           "Add Staff Member" navigates to staff/create.tsx as a separate screen.
// CONNECTED TO: auth.api.ts (getStaffList). Navigates to ./create for adding new staff.
//
// FIX (2026-09-29): staff card ab tap hota hai → sheet with "Reset password" aur
// "Deactivate/Reactivate". Pehle app "contact your Owner" bolta tha, lekin Owner
// ke paas bhi staff ka password badalne ya kisi ko hataane ka koi button nahi tha.
// Rules backend jaise hi: apne aap pe nahi, Owner pe nahi, Manager pe sirf Owner.

import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Users, ShieldCheck, ChefHat, Wallet, Lock, ChevronRight } from 'lucide-react-native';
import { authApi, StaffMember, UserRole } from '../../../features/auth/auth.api';
import { useAuthStore } from '../../../features/auth/auth.store';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { TextField } from '../../../components/ui/TextField';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../../lib/api-client';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { SkeletonList } from '../../../components/ui/Skeleton';
import { ErrorState, EmptyState } from '../../../components/ui/StateViews';
import { theme } from '../../../theme';

import { ui } from '../../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
const ROLE_META: Record<UserRole, { label: string; color: string; bg: string; icon: React.ComponentType<{ size: number; color: string }> }> = {
  OWNER: { label: 'Owner', color: theme.colors.primary, bg: theme.colors.primaryLight, icon: ShieldCheck },
  MANAGER: { label: 'Manager', color: theme.colors.primary, bg: theme.colors.primaryLight, icon: ShieldCheck },
  // UI REDESIGN (2026-10-08): amber/green "status" rang the — app mein green = paid/ready, amber =
  // preparing. Roles ab sab brand rang mein; icon hi pehchaan hai (Wallet / ChefHat / Shield).
  CASHIER: { label: 'Cashier', color: theme.colors.primary, bg: theme.colors.primaryLight, icon: Wallet },
  CHEF: { label: 'Chef', color: theme.colors.primary, bg: theme.colors.primaryLight, icon: ChefHat },
};

export default function StaffListScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  // FIX (2026-09-29): manage-staff sheet state
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canManage = (member: StaffMember) =>
    member.id !== currentUser?.id &&
    member.role !== 'OWNER' &&
    !(member.role === 'MANAGER' && currentUser?.role !== 'OWNER');

  const openSheet = (member: StaffMember) => {
    setSelected(member);
    setNewPassword('');
    setSheetError(null);
  };
  const closeSheet = () => setSelected(null);

  const handleResetPassword = async () => {
    if (!selected) return;
    if (newPassword.length < 8) return setSheetError('Password must be at least 8 characters');
    setSaving(true);
    setSheetError(null);
    try {
      await authApi.resetStaffPassword(selected.id, newPassword);
      closeSheet();
      Alert.alert('Password reset', `Share the new password with ${selected.name}. They have been logged out of all devices.`);
    } catch (err) {
      setSheetError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = () => {
    if (!selected) return;
    const member = selected;
    const deactivating = member.isActive;
    Alert.alert(
      deactivating ? `Deactivate ${member.name}?` : `Reactivate ${member.name}?`,
      deactivating
        ? 'They will be logged out immediately and cannot sign in until reactivated.'
        : 'They will be able to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: deactivating ? 'Deactivate' : 'Reactivate',
          style: deactivating ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await authApi.setStaffStatus(member.id, !deactivating);
              closeSheet();
              load();
            } catch (err) {
              setSheetError(getErrorMessage(err));
            }
          },
        },
      ]
    );
  };

  // UI/UX PASS (2026-09-30): useScreenLoad — focus pe refetch (create.tsx se wapas
  // aane pe naya staff turant dikhe) + error/retry + pull-to-refresh. Pehle load fail
  // hone pe "No staff added yet" dikhta tha, jaise saara staff gayab ho gaya ho.
  const { loading, refreshing, error, refresh, retry, reload: load } = useScreenLoad(async () => {
    setStaff(await authApi.getStaffList());
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* UI REDESIGN (2026-10-09): ab yeh screen "More" grid se khulti hai (tab nahi) → back arrow wapas */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Staff</Text>
        <Text style={styles.subtitle}>
          {staff.length > 0 ? `${staff.length} team member${staff.length === 1 ? '' : 's'}` : 'Add your Cashier and Chef accounts'}
        </Text>
      </View>

      {loading ? (
        <SkeletonList count={4} />
      ) : error && staff.length === 0 ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <FlatList
          data={staff}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const meta = ROLE_META[item.role];
            const initials = item.name
              .split(' ')
              .map((w) => w[0])
              .slice(0, 2)
              .join('')
              .toUpperCase();
            const manageable = canManage(item);
            return (
              <Pressable
                style={styles.staffCard}
                onPress={manageable ? () => openSheet(item) : undefined}
                disabled={!manageable}
              >
                <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.avatarText, { color: meta.color }]}>{initials}</Text>
                </View>
                <View style={styles.staffTextWrap}>
                  <Text style={styles.staffName}>{item.name}</Text>
                  <View style={styles.roleRow}>
                    <meta.icon size={13} color={meta.color} />
                    <Text style={[styles.roleLabel, { color: meta.color }]}>
                      {meta.label}{item.isActive ? '' : ' · Deactivated'}
                    </Text>
                  </View>
                </View>
                <View style={[styles.statusDot, { backgroundColor: item.isActive ? theme.colors.success : theme.colors.textMuted }]} />
                {manageable && <ChevronRight size={16} color={theme.colors.textMuted} style={{ marginLeft: theme.spacing.sm }} />}
              </Pressable>
            );
          }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />}
          ListEmptyComponent={
            <EmptyState
              icon={Users}
              title="No staff added yet"
              message="Add Cashier and Chef accounts so your team can start using BillRaw."
            />
          }
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={() => router.push('/(admin)/staff/create')}>
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add staff member</Text>
        </Pressable>
      </View>

      <BottomSheet visible={!!selected} onClose={closeSheet} title={selected?.name ?? ''}>
        {sheetError && <ErrorBanner message={sheetError} />}
        <TextField
          label="Set a new password"
          placeholder="At least 8 characters"
          icon={Lock}
          isPassword
          value={newPassword}
          onChangeText={(v) => {
            setNewPassword(v);
            if (sheetError) setSheetError(null);
          }}
        />
        <Button title="Reset password" onPress={handleResetPassword} loading={saving} />
        <Pressable style={styles.toggleButton} onPress={handleToggleActive}>
          <Text style={[styles.toggleText, { color: selected?.isActive ? theme.colors.danger : theme.colors.success }]}>
            {selected?.isActive ? 'Deactivate account' : 'Reactivate account'}
          </Text>
        </Pressable>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md },
  backButton: { ...ui.iconButton },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontFamily: theme.typography.font.bold, color: theme.colors.white, letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  listContent: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: theme.spacing.xl, flexGrow: 1 },
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    shadowColor: '#2B1F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  avatar: { width: 48, height: 48, borderRadius: theme.radius.full, justifyContent: 'center', alignItems: 'center', marginRight: theme.spacing.md },
  avatarText: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold},
  staffTextWrap: { flex: 1 },
  staffName: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  roleLabel: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.medium},
  statusDot: { width: 10, height: 10, borderRadius: theme.radius.full },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingTop: theme.spacing.xxl },
  emptyIconBadge: { width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg },
  emptyTitle: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.lg, backgroundColor: theme.colors.background } /* UI REDESIGN (2026-10-08): separator line hataya */,
  addButton: { flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' } /* UI REDESIGN (2026-10-08): brown glow shadow hataya */,
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
  toggleButton: { alignItems: 'center', paddingVertical: theme.spacing.lg, marginTop: theme.spacing.sm },
  toggleText: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});