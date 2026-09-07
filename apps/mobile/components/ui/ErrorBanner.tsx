// components/ui/ErrorBanner.tsx
// USE CASE: Inline form-level error banner with icon — used at the top of forms when a
//           submission fails (wrong password, server unreachable, etc).
// CONNECTED TO: Used by login.tsx, register.tsx, verify-otp.tsx, and future forms.

import { View, Text, StyleSheet } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { theme } from '../../theme';

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner}>
      <AlertCircle size={18} color={theme.colors.danger} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.dangerLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  text: {
    flex: 1,
    color: theme.colors.danger,
    fontSize: theme.typography.size.sm,
  },
});