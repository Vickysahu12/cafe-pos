// app/(admin)/outlet-edit.tsx
// USE CASE: Owner-only screen to edit Outlet details (name, address, phone, GST).
// Includes a loading skeleton (first fetch) and a retry-able error state (fetch
// failure) — same pattern to reuse for other screens as you build those out.
// CONNECTED TO: organization.api.ts (getOutlet, updateOutlet). Reached from
// settings.tsx's "Edit Outlet Details" row (Owner only).

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { z } from 'zod';
import { ArrowLeft, Store, MapPin, Phone, Receipt, AlertTriangle, ShieldAlert } from 'lucide-react-native';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAuthStore } from '../../features/auth/auth.store';
import { organizationApi, OutletDetails } from '../../features/organization/organization.api';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

const ACCENT = '#2563EB';

const OutletEditSchema = z.object({
  name: z.string().min(2, 'Outlet name is too short'),
  address: z.string().min(5, 'Address is too short'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  gstNumber: z.string().optional(),
});

type FetchState = 'loading' | 'error' | 'ready';

export default function OutletEditScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [fetchState, setFetchState] = useState<FetchState>('loading');
  const [form, setForm] = useState({ name: '', address: '', phone: '', gstNumber: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadOutlet = useCallback(async () => {
    setFetchState('loading');
    try {
      const outlet: OutletDetails = await organizationApi.getOutlet();
      setForm({
        name: outlet.name ?? '',
        address: outlet.address ?? '',
        phone: outlet.phone ?? '',
        gstNumber: outlet.gstNumber ?? '',
      });
      setFetchState('ready');
    } catch {
      setFetchState('error');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOutlet();
    }, [loadOutlet])
  );

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const handleSave = async () => {
    setFormError(null);
    const result = OutletEditSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    setErrors({});
    Keyboard.dismiss();
    setSaving(true);
    try {
      await organizationApi.updateOutlet({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        gstNumber: form.gstNumber.trim() || undefined,
      });
      router.back();
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // Owner-only screen — defense in depth, matching the guard pattern used on
  // audit-logs.tsx, in case this is ever reached via deep-link or stale UI.
  if (user?.role !== 'OWNER') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header router={router} />
        <View style={styles.centerFill}>
          <ShieldAlert size={32} color={theme.colors.textMuted} />
          <Text style={styles.restrictedText}>Only the Owner can edit outlet details</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header router={router} />

      {fetchState === 'loading' && <OutletEditSkeleton />}

      {fetchState === 'error' && (
        <View style={styles.centerFill}>
          <View style={styles.errorIconBadge}>
            <AlertTriangle size={26} color={theme.colors.danger} />
          </View>
          <Text style={styles.errorTitle}>Couldn't load outlet details</Text>
          <Text style={styles.errorSubtext}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            onPress={loadOutlet}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {fetchState === 'ready' && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              {formError && <ErrorBanner message={formError} />}

              <TextField
                label="Outlet Name"
                placeholder="Billraw Cafe - Indore"
                icon={Store}
                value={form.name}
                onChangeText={(v) => update('name', v)}
                error={errors.name}
                returnKeyType="next"
              />
              <TextField
                label="Address"
                placeholder="123 MG Road, Indore"
                icon={MapPin}
                value={form.address}
                onChangeText={(v) => update('address', v)}
                error={errors.address}
                multiline
                returnKeyType="next"
              />
              <TextField
                label="Phone"
                placeholder="9876543210"
                keyboardType="phone-pad"
                maxLength={10}
                icon={Phone}
                value={form.phone}
                onChangeText={(v) => update('phone', v)}
                error={errors.phone}
                returnKeyType="next"
              />
              <TextField
                label="GST Number (optional)"
                placeholder="22AAAAA0000A1Z5"
                autoCapitalize="characters"
                icon={Receipt}
                value={form.gstNumber}
                onChangeText={(v) => update('gstNumber', v)}
                error={errors.gstNumber}
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />

              <Button title="Save Changes" onPress={handleSave} loading={saving} />
            </ScrollView>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function Header({ router }: { router: ReturnType<typeof useRouter> }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
        <ArrowLeft size={19} color={theme.colors.textPrimary} />
      </Pressable>
      <Text style={styles.headerTitle}>Edit Outlet Details</Text>
      <View style={{ width: 38 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Skeleton — reusable shimmer pattern. Copy this block (Shimmer + the bar
// layout below) for other screens' loading states rather than a spinner,
// since it visually previews the shape of the content that's about to load.
// ─────────────────────────────────────────────────────────────────────────

function Shimmer({ style }: { style: any }) {
  const [opacity] = useState(new Animated.Value(0.4));

  useFocusEffect(
    useCallback(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.4, duration: 650, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }, [opacity])
  );

  return <Animated.View style={[style, { opacity }]} />;
}

function OutletEditSkeleton() {
  return (
    <View style={styles.content}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={{ marginBottom: theme.spacing.lg }}>
          <Shimmer style={styles.skeletonLabel} />
          <Shimmer style={styles.skeletonField} />
        </View>
      ))}
      <Shimmer style={styles.skeletonButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, gap: theme.spacing.sm },
  restrictedText: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },

  content: { padding: theme.spacing.xl },

  errorIconBadge: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.dangerLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  errorSubtext: { fontSize: 12, color: theme.colors.textMuted, textAlign: 'center' },
  retryButton: {
    marginTop: theme.spacing.sm,
    backgroundColor: ACCENT,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
  },
  retryButtonPressed: { opacity: 0.85 },
  retryButtonText: { color: '#FFFFFF', fontWeight: theme.typography.weight.semibold, fontSize: theme.typography.size.sm },

  skeletonLabel: {
    width: 90,
    height: 12,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
    marginBottom: 8,
  },
  skeletonField: {
    width: '100%',
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
  },
  skeletonButton: {
    width: '100%',
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.sm,
  },
});