// app/(admin)/change-password.tsx
// USE CASE (2026-09-29): Owner/Manager apna password badle. Purana password
// zaroori hai. Success pe backend baaki saare devices logout kar deta hai aur
// is device ko naye tokens deta hai (yahan store ho jaate hain, user logged-in rehta hai).
// CONNECTED TO: auth.api.ts (changePassword), lib/storage.ts. Settings → Change Password.

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Lock } from 'lucide-react-native';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { authApi } from '../../features/auth/auth.api';
import { storage } from '../../lib/storage';
import { getErrorMessage } from '../../lib/api-client';
import { theme } from '../../theme';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!currentPassword) return setError('Enter your current password');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters');
    if (newPassword.length > 72) return setError('New password is too long');
    if (newPassword !== confirmPassword) return setError("New passwords don't match");
    if (newPassword === currentPassword) return setError('New password must be different');

    Keyboard.dismiss();
    setLoading(true);
    try {
      const tokens = await authApi.changePassword(currentPassword, newPassword);
      await storage.setAccessToken(tokens.accessToken);
      await storage.setRefreshToken(tokens.refreshToken);
      Alert.alert('Password changed', 'Your password was updated. Other devices have been logged out.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error && <ErrorBanner message={error} />}
        <TextField label="Current password" icon={Lock} isPassword value={currentPassword} onChangeText={setCurrentPassword} />
        <TextField label="New password" placeholder="At least 8 characters" icon={Lock} isPassword value={newPassword} onChangeText={setNewPassword} />
        <TextField
          label="Confirm new password"
          icon={Lock}
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
        <Button title="Update Password" onPress={handleSave} loading={loading} style={{ marginTop: theme.spacing.sm }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md,
    borderBottomWidth: 1, borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  content: { padding: theme.spacing.xl },
});
