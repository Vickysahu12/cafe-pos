// app/(auth)/login.tsx
// USE CASE: Login screen — all roles (Owner, Manager, Cashier, Chef) sign in here.
// CONNECTED TO: features/auth/auth.store.ts (login action). app/index.tsx handles the
//               post-login role-based redirect automatically once isAuthenticated flips true.

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
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginScreen() {
  const router = useRouter();
  const login = useAuthStore((s) => s.login);

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
});