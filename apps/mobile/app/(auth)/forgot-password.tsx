// app/(auth)/forgot-password.tsx
// USE CASE (2026-09-29): "Forgot password?" — do step ka flow ek hi screen pe:
//   Step 1: email daalo → backend 6-digit code bhejta hai
//   Step 2: code + naya password → password reset → login screen pe wapas
// Pehle password bhoolne ka koi raasta nahi tha (Owner hamesha ke liye locked out).
// CONNECTED TO: auth.api.ts (forgotPassword, resetPassword). login.tsx ka "Forgot password?" link.
//
// NOTE: backend step 1 pe hamesha same message deta hai (email registered ho ya
// nahi) — security ke liye. Isliye yeh screen bhi hamesha step 2 pe jaati hai.

import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import { ArrowLeft, KeyRound, Mail, Lock } from 'lucide-react-native';
import { TextField } from '../../components/ui/TextField';
import { OtpInput } from '../../components/ui/OtpInput';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { authApi } from '../../features/auth/auth.api';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

const RESEND_COOLDOWN = 60;
const EmailSchema = z.string().email('Invalid email address');
const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long');

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) clearInterval(timerRef.current);
        return c - 1;
      });
    }, 1000);
  };

  const normalizedEmail = email.trim().toLowerCase();

  const sendCode = async () => {
    setError(null);
    setFieldError(null);
    if (!EmailSchema.safeParse(normalizedEmail).success) {
      setFieldError('Invalid email address');
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    try {
      const message = await authApi.forgotPassword(normalizedEmail);
      setInfo(message);
      setStep('reset');
      startCooldown();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    setError(null);
    setFieldError(null);
    if (otp.length !== 6) {
      setError('Enter the 6-digit code from your email');
      return;
    }
    const pw = PasswordSchema.safeParse(newPassword);
    if (!pw.success) {
      setFieldError(pw.error.issues[0].message);
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("Passwords don't match");
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    try {
      await authApi.resetPassword(normalizedEmail, otp, newPassword);
      Alert.alert('Password updated', 'You can now sign in with your new password.', [
        { text: 'Sign In', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <Pressable
              onPress={() => (step === 'reset' ? setStep('email') : router.back())}
              hitSlop={10}
              style={styles.backButton}
            >
              <ArrowLeft size={20} color={theme.colors.textPrimary} />
            </Pressable>

            <View style={styles.iconBadge}>
              <KeyRound size={28} color={theme.colors.primary} />
            </View>

            <Text style={styles.title}>{step === 'email' ? 'Forgot password?' : 'Set a new password'}</Text>
            <Text style={styles.subtitle}>
              {step === 'email'
                ? "Enter your account email and we'll send you a 6-digit code."
                : info ?? 'Enter the code we emailed you.'}
            </Text>

            {error && <ErrorBanner message={error} />}

            {step === 'email' ? (
              <>
                <TextField
                  label="Email"
                  placeholder="you@example.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  icon={Mail}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    if (fieldError) setFieldError(null);
                  }}
                  error={fieldError ?? undefined}
                  returnKeyType="send"
                  onSubmitEditing={sendCode}
                />
                <Button title="Send Code" onPress={sendCode} loading={loading} style={{ marginTop: theme.spacing.sm }} />
                <Text style={styles.hint}>
                  Staff member without email access? Ask your cafe Owner or Manager to reset your password from the Staff screen.
                </Text>
              </>
            ) : (
              <>
                <OtpInput value={otp} onChange={(v) => { setOtp(v); if (error) setError(null); }} error={!!error} />
                <TextField
                  label="New password"
                  placeholder="At least 8 characters"
                  icon={Lock}
                  isPassword
                  value={newPassword}
                  onChangeText={(v) => {
                    setNewPassword(v);
                    if (fieldError) setFieldError(null);
                  }}
                />
                <TextField
                  label="Confirm new password"
                  placeholder="Re-enter password"
                  icon={Lock}
                  isPassword
                  value={confirmPassword}
                  onChangeText={(v) => {
                    setConfirmPassword(v);
                    if (fieldError) setFieldError(null);
                  }}
                  error={fieldError ?? undefined}
                  returnKeyType="done"
                  onSubmitEditing={submitReset}
                />
                <Button title="Reset Password" onPress={submitReset} loading={loading} style={{ marginTop: theme.spacing.sm }} />

                <View style={styles.resendRow}>
                  {cooldown > 0 ? (
                    <Text style={styles.resendMuted}>Resend code in {cooldown}s</Text>
                  ) : (
                    <Text style={styles.resendLink} onPress={loading ? undefined : sendCode}>
                      Resend code
                    </Text>
                  )}
                </View>
              </>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.surface },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
  backButton: { width: 32, height: 32, justifyContent: 'center', marginBottom: theme.spacing.lg },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.size.xxl,
    fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.typography.size.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xxl,
    lineHeight: 22,
  },
  hint: {
    fontSize: theme.typography.size.sm,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    lineHeight: 20,
  },
  resendRow: { alignItems: 'center', marginTop: theme.spacing.xl },
  resendMuted: { color: theme.colors.textMuted, fontSize: theme.typography.size.sm },
  resendLink: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold, fontSize: theme.typography.size.sm },
});
