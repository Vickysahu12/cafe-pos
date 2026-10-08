// app/consent.tsx
// USE CASE (2026-09-30): Staff ki PEHLI login pe ek baar dikhta hai. Owner ne staff
// account banaya tha, lekin staff ne khud kabhi Terms & Privacy Policy accept nahi
// kiye — DPDP Act, 2023 ke hisaab se har person ka apna consent chahiye. Accept
// karne pe backend timestamp + CONSENT_ACCEPTED audit record likhta hai.
// Decline = logout (bina consent ke app use nahi ho sakta).
// CONNECTED TO: app/index.tsx (consentAcceptedAt null ho to yahan bhejta hai),
//               auth.store.ts (acceptConsent, logout), components/ui/ConsentCheckBox.tsx.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { ConsentCheckbox } from '../components/ui/ConsentCheckBox';
import { Button } from '../components/ui/Button';
import { ErrorBanner } from '../components/ui/ErrorBanner';
import { useAuthStore } from '../features/auth/auth.store';
import { getErrorMessage } from '../lib/api-client';
import { theme } from '../theme';

const DATA_POINTS = [
  'Your name, email and phone number (to run your staff account)',
  'The orders and actions you perform in the app (for billing and audit records)',
  'Basic device and log information (to keep the service secure)',
];

export default function ConsentScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const acceptConsent = useAuthStore((s) => s.acceptConsent);
  const logout = useAuthStore((s) => s.logout);

  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (!checked) {
      setError('Please tick the box to continue');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await acceptConsent();
      router.replace('/');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconBadge}>
          <ShieldCheck size={28} color={theme.colors.primary} />
        </View>
        <Text style={styles.title}>Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!</Text>
        <Text style={styles.subtitle}>
          Your cafe has added you to BillRaw. Before you start, please review how we use your information.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What we collect</Text>
          {DATA_POINTS.map((line) => (
            <Text key={line} style={styles.bullet}>•  {line}</Text>
          ))}
          <Text style={styles.cardNote}>
            We never sell your data. You can ask your cafe owner to remove your account at any time.
          </Text>
        </View>

        {error && <ErrorBanner message={error} />}

        <ConsentCheckbox checked={checked} onToggle={(v) => { setChecked(v); if (error) setError(null); }} />

        <Button title="Accept & Continue" onPress={handleAccept} loading={loading} style={{ marginTop: theme.spacing.md }} />
        <Button title="Decline & log out" variant="secondary" onPress={logout} style={{ marginTop: theme.spacing.sm }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.surface },
  content: { flexGrow: 1, justifyContent: 'center', padding: theme.spacing.xl },
  iconBadge: {
    width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', alignSelf: 'center', marginBottom: theme.spacing.lg,
  },
  title: {
    fontSize: theme.typography.size.xxl, fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary, textAlign: 'center', marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary,
    textAlign: 'center', lineHeight: 22, marginBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.background, borderRadius: theme.radius.lg, borderWidth: 1,
    borderColor: theme.colors.border, padding: theme.spacing.lg, marginBottom: theme.spacing.lg, gap: 4,
  },
  cardTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary, marginBottom: 4 },
  bullet: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary, lineHeight: 20 },
  cardNote: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20, marginTop: theme.spacing.sm },
});
