// app/(admin)/delete-account.tsx
// USE CASE (2026-09-29): Owner apna account + POORE cafe ka data permanently
// delete kare. Google Play ka mandatory rule (account banane wali har app mein
// in-app delete hona chahiye) + DPDP Act "right to erasure".
// Safety: password + "DELETE" type karna padta hai, aur ek aakhri confirm alert.
// CONNECTED TO: auth.api.ts (deleteAccount), auth.store.ts (logout). Settings → Delete Account (Owner only).

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Lock, AlertTriangle } from 'lucide-react-native';
import { TextField } from '../../components/ui/TextField';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { authApi } from '../../features/auth/auth.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
const WILL_BE_DELETED = [
  'Your Owner account and all staff accounts',
  'All outlets, menus, tables and inventory',
  'All orders, bills, sales reports and audit logs',
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = password.length > 0 && confirmText === 'DELETE' && !loading;

  const doDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await authApi.deleteAccount(password);
      // Server pe sab delete ho chuka — local session saaf karo (logout ka
      // backend call fail hoga kyunki token ab invalid hai, woh ignore hota hai)
      await logout();
      Alert.alert('Account deleted', 'Your account and all cafe data have been permanently deleted.');
    } catch (err) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Keyboard.dismiss();
    Alert.alert(
      'Delete everything?',
      'This permanently deletes your cafe and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Permanently', style: 'destructive', onPress: doDelete },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Delete account</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.warningCard}>
          <AlertTriangle size={22} color={theme.colors.danger} />
          <Text style={styles.warningTitle}>This is permanent</Text>
          <Text style={styles.warningText}>Deleting your account will permanently remove:</Text>
          {WILL_BE_DELETED.map((line) => (
            <Text key={line} style={styles.bullet}>•  {line}</Text>
          ))}
          <Text style={[styles.warningText, { marginTop: theme.spacing.sm }]}>
            Your staff will be logged out immediately. If you need your sales records (e.g. for GST), note them down first.
          </Text>
        </View>

        {error && <ErrorBanner message={error} />}

        <TextField label="Your password" icon={Lock} isPassword value={password} onChangeText={setPassword} />
        <TextField
          label='Type "DELETE" to confirm'
          placeholder="DELETE"
          autoCapitalize="characters"
          autoCorrect={false}
          value={confirmText}
          onChangeText={setConfirmText}
        />

        <Pressable
          style={[styles.deleteButton, !canSubmit && styles.deleteButtonDisabled]}
          onPress={handleDelete}
          disabled={!canSubmit}
        >
          <Text style={styles.deleteButtonText}>{loading ? 'Deleting…' : 'Delete My Account'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },
  content: { padding: theme.spacing.lg }, // UI REDESIGN (2026-10-08): 16px gutter (poori app jaisa)
  warningCard: {
    backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.lg,
    padding: theme.spacing.lg, marginBottom: theme.spacing.xl, gap: 4,
  },
  warningTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold, color: theme.colors.danger, marginTop: theme.spacing.xs },
  warningText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary, lineHeight: 20 },
  bullet: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary, lineHeight: 20 },
  deleteButton: {
    height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.danger,
    justifyContent: 'center', alignItems: 'center', marginTop: theme.spacing.sm,
  },
  deleteButtonDisabled: { opacity: 0.4 },
  deleteButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});
