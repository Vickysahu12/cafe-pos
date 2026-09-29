// app/(auth)/login.tsx
// USE CASE: Login screen — all roles (Owner, Manager, Cashier, Chef) sign in here.
// CONNECTED TO: features/auth/auth.store.ts (login action). app/index.tsx handles the
//               post-login role-based redirect automatically once isAuthenticated flips true.
//
// FIX: the backend can now return EMAIL_NOT_VERIFIED (with the user's id) when
// someone tries to log in before verifying their email. Previously this just
// showed a red banner with no way forward — now it sends them straight to OTP
// verification, reusing the same screen the register flow uses.

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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import { Mail, Lock } from 'lucide-react-native';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { BrandMark } from '../../components/ui/BrandMark';
import { useAuthStore } from '../../features/auth/auth.store';
import { getErrorMessage, getErrorCode } from '../../lib/api-client';
import { theme } from '../../theme';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);
  const setPendingVerification = useAuthStore((s) => s.setPendingVerification);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setFormError(null);
    const result = LoginSchema.safeParse({ email, password });
    if (!result.success) {
      const errors: typeof fieldErrors = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as 'email' | 'password'] = issue.message;
      });
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    Keyboard.dismiss();
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace('/');
    } catch (err) {
      const { code, userId } = getErrorCode(err);

      if (code === 'EMAIL_NOT_VERIFIED' && userId) {
        setPendingVerification(userId, email.trim().toLowerCase());
        router.push('/(auth)/verify-otp');
        return;
      }

      // ACCOUNT_DEACTIVATED and everything else already has a clear,
      // human-readable message from the backend — just show it.
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
            <BrandMark />
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue to your outlet</Text>

            {formError && <ErrorBanner message={formError} />}

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
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined }));
              }}
              error={fieldErrors.email}
              returnKeyType="next"
            />
            <TextField
              label="Password"
              placeholder="••••••••"
              icon={Lock}
              isPassword
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: undefined }));
              }}
              error={fieldErrors.password}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            {/* FIX (2026-09-29): forgot-password flow — pehle koi raasta nahi tha */}
            <Text style={styles.forgotLink} onPress={() => router.push('/(auth)/forgot-password')}>
              Forgot password?
            </Text>

            <Button title="Sign In" onPress={handleLogin} loading={loading} style={{ marginTop: theme.spacing.sm }} />

            <Text style={styles.footerText}>
              New here?{' '}
              <Text style={styles.link} onPress={() => router.push('/(auth)/register')}>
                Create an organization
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
  title: {
    fontSize: theme.typography.size.xxxl,
    fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.size.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xxl,
  },
  footerText: {
    textAlign: 'center',
    marginTop: theme.spacing.xl,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.size.sm,
  },
  link: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold },
  forgotLink: {
    alignSelf: 'flex-end',
    color: theme.colors.primary,
    fontWeight: theme.typography.weight.semibold,
    fontSize: theme.typography.size.sm,
    marginBottom: theme.spacing.md,
  },
});