// components/ui/BrandMark.tsx
// USE CASE: App identity mark shown on auth screens (login, register). Replaces the
// old plain-letter placeholder with an icon badge + wordmark, so the brand actually
// reads as intentional rather than a default avatar. `compact` collapses it into a
// single row for screens with less vertical room (e.g. register's 2-step flow).

import { View, Text, StyleSheet } from 'react-native';
import { Coffee } from 'lucide-react-native';
import { theme } from '../../theme';

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  if (compact) {
    return (
      <View style={styles.rowWrapper}>
        <View style={styles.badgeCompact}>
          <Coffee size={18} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <Text style={styles.wordmarkCompact}>BillRaw</Text>
      </View>
    );
  }

  return (
    <View style={styles.columnWrapper}>
      <View style={styles.badge}>
        <Coffee size={26} color="#FFFFFF" strokeWidth={2.2} />
      </View>
      <Text style={styles.wordmark}>BillRaw</Text>
      <Text style={styles.tagline}>Point-of-sale for modern cafés</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  columnWrapper: { alignItems: 'center', marginBottom: theme.spacing.xxl },
  rowWrapper: { flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.lg },

  badge: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
  },
  badgeCompact: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.sm,
  },

  wordmark: {
    fontSize: theme.typography.size.xl,
    fontFamily: theme.typography.fontFamilyBrand, // UI REDESIGN (2026-10-08): wordmark Space Grotesk hi rahega
    color: theme.colors.textPrimary,
    letterSpacing: 0.2,
  },
  wordmarkCompact: {
    fontSize: theme.typography.size.base,
    fontFamily: theme.typography.fontFamilyBrand, // UI REDESIGN (2026-10-08): wordmark Space Grotesk hi rahega
    color: theme.colors.textPrimary,
    letterSpacing: 0.2,
  },
  tagline: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 3,
  },
});