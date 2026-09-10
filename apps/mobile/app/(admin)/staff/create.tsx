// app/(admin)/staff/create.tsx
// USE CASE: Add a new staff member — full screen form with role picker.
//           Separate screen (not a modal) per this app's navigation pattern.
// CONNECTED TO: auth.api.ts (createStaff). auth.store.ts for current user's outletId.
//               Navigates back to ./index on success, which auto-refreshes via useFocusEffect.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Keyboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { authApi, UserRole } from '../../../features/auth/auth.api';
import { useAuthStore } from '../../../features/auth/auth.store';
import { TextField } from '../../../components/ui/TextField';
import { Button } from '../../../components/ui/Button';
import { ErrorBanner } from '../../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../../lib/api-client';
import { theme } from '../../../theme';

const ASSIGNABLE_ROLES: { value: 'CASHIER' | 'CHEF' | 'MANAGER'; label: string }[] = [
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'CHEF', label: 'Chef' },
  { value: 'MANAGER', label: 'Manager' },
];

export default function CreateStaffScreen() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [selectedRole, setSelectedRole] = useState<'CASHIER' | 'CHEF' | 'MANAGER'>('CASHIER');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: '' }));
  };

  const handleSubmit = async () => {
    setFormError(null);
    const errors: Record<string, string> = {};
    if (form.name.trim().length < 2) errors.name = 'Name is too short';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) errors.email = 'Invalid email address';
    if (!/^[6-9]\d{9}$/.test(form.phone)) errors.phone = 'Enter a valid 10-digit mobile number';
    if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    if (!currentUser?.outletId) {
      setFormError('Could not determine your outlet. Please try logging in again.');
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    try {
      await authApi.createStaff({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone,
        password: form.password,
        role: selectedRole,
        outletId: currentUser.outletId,
      });
      router.back();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>NEW STAFF</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Add Staff Member</Text>
            <Text style={styles.subtitle}>They'll be able to sign in with the email and password you set here.</Text>

            {formError && <ErrorBanner message={formError} />}

            <Text style={styles.roleSelectorLabel}>Role</Text>
            <View style={styles.roleSelector}>
              {ASSIGNABLE_ROLES.map((r) => (
                <Pressable
                  key={r.value}
                  style={[styles.roleChip, selectedRole === r.value && styles.roleChipActive]}
                  onPress={() => setSelectedRole(r.value)}
                >
                  <Text style={[styles.roleChipText, selectedRole === r.value && styles.roleChipTextActive]}>{r.label}</Text>
                </Pressable>
              ))}
            </View>

            <TextField label="Full Name" placeholder="e.g. Aman Das" value={form.name} onChangeText={(v) => update('name', v)} error={fieldErrors.name} returnKeyType="next" />
            <TextField label="Email" placeholder="staff@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" value={form.email} onChangeText={(v) => update('email', v)} error={fieldErrors.email} returnKeyType="next" />
            <TextField label="Phone" placeholder="9876543210" keyboardType="phone-pad" maxLength={10} value={form.phone} onChangeText={(v) => update('phone', v)} error={fieldErrors.phone} returnKeyType="next" />
            <TextField label="Password" placeholder="At least 8 characters" isPassword value={form.password} onChangeText={(v) => update('password', v)} error={fieldErrors.password} returnKeyType="done" onSubmitEditing={handleSubmit} />

            <Button title="Add Staff Member" onPress={handleSubmit} loading={saving} style={{ marginTop: theme.spacing.sm }} />
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.sm },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.white, letterSpacing: 0.6 },
  content: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  title: { fontSize: 26, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
  subtitle: { fontSize: theme.typography.size.base, color: theme.colors.textSecondary, lineHeight: 21, marginBottom: theme.spacing.xl },
  roleSelectorLabel: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
  roleSelector: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  roleChip: { flex: 1, height: 44, borderRadius: theme.radius.md, borderWidth: 1.5, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  roleChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  roleChipText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },
  roleChipTextActive: { color: theme.colors.white },
});