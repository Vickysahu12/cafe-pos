// app/(auth)/verify-otp.tsx
// USE CASE: OTP verification after registration — 6-box code input, resend with cooldown timer.
// CONNECTED TO: features/auth/auth.store.ts (verifyEmail, resendOtp). On success, app/index.tsx
//               picks up isAuthenticated and redirects to the right role home (Owner → Admin dashboard).

import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import { OtpInput } from '../../components/ui/OtpInput';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { useAuthStore } from '../../features/auth/auth.store';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

const RESEND_COOLDOWN = 60;

export default function VerifyOtpScreen() {
  const router = useRouter();
  const { verifyEmail, resendOtp, pendingEmail, pendingUserId } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pendingUserId) {
      router.replace('/(auth)/register');
      return;
    }
    startCooldown();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
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

  const handleVerify = async (code?: string) => {
    setError(null);
    const finalOtp = code ?? otp;
    if (finalOtp.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }
    Keyboard.dismiss();
    setLoading(true);
    try {
      await verifyEmail(finalOtp);
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (value: string) => {
    setOtp(value);
    if (error) setError(null);
    if (value.length === 6) {
      // Auto-submit the moment the 6th digit lands — one less tap for the user
      handleVerify(value);
    }
  };

  const handleResend = async () => {
    setError(null);
    setResendSuccess(false);
    setResending(true);
    try {
      await resendOtp();
      startCooldown();
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.content}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
            <ArrowLeft size={20} color={theme.colors.textPrimary} />
          </Pressable>

          <View style={styles.iconBadge}>
            <MailCheck size={28} color={theme.colors.primary} />
          </View>

          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            We sent a 6-digit code to{'\n'}
            <Text style={{ fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary }}>
              {pendingEmail}
            </Text>
          </Text>

          {error && <ErrorBanner message={error} />}
          {resendSuccess && (
            <View style={styles.successBanner}>
              <Text style={styles.successText}>A new code has been sent.</Text>
            </View>
          )}

          <OtpInput value={otp} onChange={handleOtpChange} error={!!error} />

          <Button title="Verify & Continue" onPress={() => handleVerify()} loading={loading} />

          <View style={styles.resendRow}>
            {cooldown > 0 ? (
              <Text style={styles.resendMuted}>Resend code in {cooldown}s</Text>
            ) : (
              <Text style={styles.resendLink} onPress={resending ? undefined : handleResend}>
                {resending ? 'Sending...' : 'Resend code'}
              </Text>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.surface },
  content: { flex: 1, justifyContent: 'center', padding: theme.spacing.xl },
  backButton: {
    position: 'absolute',
    top: theme.spacing.lg,
    left: theme.spacing.xl,
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
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
  successBanner: {
    backgroundColor: theme.colors.successLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  successText: { color: theme.colors.success, fontSize: theme.typography.size.sm, textAlign: 'center' },
  resendRow: { alignItems: 'center', marginTop: theme.spacing.xl },
  resendMuted: { color: theme.colors.textMuted, fontSize: theme.typography.size.sm },
  resendLink: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold, fontSize: theme.typography.size.sm },
});