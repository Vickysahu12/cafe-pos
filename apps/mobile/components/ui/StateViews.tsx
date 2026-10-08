// components/ui/StateViews.tsx
// USE CASE (2026-09-30): Har screen ke 2 common states ek jaisa dikhane ke liye:
//   - EmptyState: data hi nahi hai ("No orders yet") + optional action button
//   - ErrorState: load fail hua (WiFi gaya / server down) + "Try Again" button
// Pehle kai screens pe load fail hone pe khaali/blank screen dikhti thi — user ko
// pata hi nahi chalta tha ki kuch gadbad hai ya bas data nahi hai.
// CONNECTED TO: list screens (orders, menu, staff, tables, inventory, audit, KDS, billing).

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { WifiOff, RotateCw, type LucideIcon } from 'lucide-react-native';
import { theme } from '../../theme';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconBadge}>
        <Icon size={28} color={theme.colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable style={styles.actionButton} onPress={onAction}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconBadge, { backgroundColor: theme.colors.dangerLight }]}>
        <WifiOff size={28} color={theme.colors.danger} />
      </View>
      <Text style={styles.title}>Couldn't load this</Text>
      <Text style={styles.message}>{message ?? 'Check your internet connection and try again.'}</Text>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <RotateCw size={16} color={theme.colors.primary} />
        <Text style={styles.retryText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl, paddingVertical: theme.spacing.xxl },
  iconBadge: {
    width: 64, height: 64, borderRadius: theme.radius.lg, backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: theme.spacing.lg,
  },
  title: { fontSize: theme.typography.size.lg, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, textAlign: 'center' },
  message: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  actionButton: {
    marginTop: theme.spacing.lg, backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md,
  },
  actionText: { color: theme.colors.white, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold},
  retryButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: theme.spacing.lg,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.md, borderRadius: theme.radius.md,
  },
  retryText: { color: theme.colors.primary, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold},
});
