// components/ui/BrandMark.tsx
// USE CASE: Small circular brand badge shown at the top of auth screens — minimal,
//           not a hero image, just enough to anchor the screen with the brand.
// CONNECTED TO: app/(auth)/login.tsx, register.tsx, verify-otp.tsx

import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme';

export function BrandMark() {
  return (
    <View style={styles.badge}>
      <Text style={styles.letter}>B</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  letter: {
    color: theme.colors.white,
    fontSize: 26,
    fontFamily: theme.typography.fontFamilyDisplay,
  },
});