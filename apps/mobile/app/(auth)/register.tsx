// app/(auth)/register.tsx
// USE CASE: Owner registration — creates Organization + Outlet + Owner account (backend: POST /auth/register).
//           Two steps for better UX: personal details, then business details.
// CONNECTED TO: features/auth/auth.store.ts (register action) → redirects to verify-otp.tsx.

import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import { ArrowLeft, User, Mail, Phone, Lock, Building2, Store, MapPin } from 'lucide-react-native';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAuthStore } from '../../features/auth/auth.store';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

const StepOneSchema = z.object({
  ownerName: z.string().min(2, 'Name is too short'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const StepTwoSchema = z.object({
  organizationName: z.string().min(2, 'Organization name is too short'),
  outletName: z.string().min(2, 'Outlet name is too short'),
  outletAddress: z.string().min(5, 'Address is too short'),
});

export default function RegisterScreen() {
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({
    ownerName: '',
    email: '',
    phone: '',
    password: '',
    organizationName: '',
    outletName: '',
    outletAddress: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
  };

  const handleNext = () => {
    const result = StepOneSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    setErrors({});
    setFormError(null);
    Keyboard.dismiss();
    setStep(2);
  };

  const handleSubmit = async () => {
    setFormError(null);
    const result = StepTwoSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      result.error.issues.forEach((i) => (errs[i.path[0] as string] = i.message));
      setErrors(errs);
      return;
    }
    setErrors({});
    Keyboard.dismiss();
    setLoading(true);
    try {
      await register({
        organizationName: form.organizationName,
        ownerName: form.ownerName,
        email: form.email.trim().toLowerCase(),
        phone: form.phone,
        password: form.password,
        outletName: form.outletName,
        outletAddress: form.outletAddress,
      });
      router.push('/(auth)/verify-otp');
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.topRow}>
              {step === 2 ? (
                <Pressable onPress={() => setStep(1)} hitSlop={10} style={styles.backButton}>
                  <ArrowLeft size={20} color={theme.colors.textPrimary} />
                </Pressable>
              ) : (
                <View style={styles.backButton} />
              )}
              <View style={styles.progressRow}>
                <View style={[styles.progressDot, styles.progressDotActive]} />
                <View style={[styles.progressDot, step === 2 && styles.progressDotActive]} />
              </View>
            </View>

            <Text style={styles.title}>{step === 1 ? 'Create your account' : 'Set up your outlet'}</Text>
            <Text style={styles.subtitle}>
              {step === 1 ? 'Tell us a bit about yourself' : "Almost done — what's your business called?"}
            </Text>

            {formError && <ErrorBanner message={formError} />}

            {step === 1 ? (
              <>
                <TextField
                  label="Your Name"
                  placeholder="Vicky Sharma"
                  icon={User}
                  value={form.ownerName}
                  onChangeText={(v) => update('ownerName', v)}
                  error={errors.ownerName}
                  returnKeyType="next"
                />
                <TextField
                  label="Email"
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  icon={Mail}
                  value={form.email}
                  onChangeText={(v) => update('email', v)}
                  error={errors.email}
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
                  label="Password"
                  placeholder="At least 8 characters"
                  icon={Lock}
                  isPassword
                  value={form.password}
                  onChangeText={(v) => update('password', v)}
                  error={errors.password}
                  returnKeyType="done"
                  onSubmitEditing={handleNext}
                />
                <Button title="Continue" onPress={handleNext} />
              </>
            ) : (
              <>
                <TextField
                  label="Organization Name"
                  placeholder="Billraw Cafes Pvt Ltd"
                  icon={Building2}
                  value={form.organizationName}
                  onChangeText={(v) => update('organizationName', v)}
                  error={errors.organizationName}
                  returnKeyType="next"
                />
                <TextField
                  label="Outlet Name"
                  placeholder="Billraw Cafe - Indore"
                  icon={Store}
                  value={form.outletName}
                  onChangeText={(v) => update('outletName', v)}
                  error={errors.outletName}
                  returnKeyType="next"
                />
                <TextField
                  label="Outlet Address"
                  placeholder="123 MG Road, Indore"
                  icon={MapPin}
                  value={form.outletAddress}
                  onChangeText={(v) => update('outletAddress', v)}
                  error={errors.outletAddress}
                  multiline
                  returnKeyType="done"
                />
                <Button title="Create Account" onPress={handleSubmit} loading={loading} />
              </>
            )}

            <Text style={styles.footerText}>
              Already have an account?{' '}
              <Text style={styles.link} onPress={() => router.replace('/(auth)/login')}>
                Sign in
              </Text>
            </Text>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.surface },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.xl },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  progressRow: { flexDirection: 'row', gap: theme.spacing.xs, flex: 1, marginLeft: theme.spacing.sm },
  progressDot: { height: 4, flex: 1, borderRadius: theme.radius.full, backgroundColor: theme.colors.border },
  progressDotActive: { backgroundColor: theme.colors.primary },
  title: {
    fontSize: theme.typography.size.xxl,
    fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.size.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
  },
  footerText: {
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.size.sm,
  },
  link: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold },
});