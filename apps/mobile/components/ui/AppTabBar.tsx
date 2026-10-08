// components/ui/AppTabBar.tsx
// ADDED (2026-10-08): UI REDESIGN — Owner/Manager AUR Cashier dono ka ek jaisa bottom tab bar.
// USE CASE: pehle admin ka tab bar custom (pill) tha aur cashier ka default system wala
// (alag font, alag rang) — ek hi app do alag apps jaisi lagti thi. Ab dono yahi use karte hain.
//  - Active tab: espresso icon + roast-wash pill + semibold label
//  - Inactive: textSecondary (icon 3:1+ contrast — pehle textMuted bahut halka tha)
//  - Tab switch pe koi animation nahi (din mein saikdon baar — animate-expo rule)
//  - Upar hairline border (shadow ki jagah — warm background pe saaf)

import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';

export function TabIcon({
  Icon,
  focused,
  label,
}: {
  Icon: React.ComponentType<{ size: number; color: string }>;
  focused: boolean;
  label: string;
}) {
  return (
    <View style={styles.tabItem} accessibilityLabel={label}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Icon size={20} color={focused ? theme.colors.primary : theme.colors.textSecondary} />
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Tabs `screenOptions` ke liye — safe-area ke saath height */
export function useAppTabBarOptions() {
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarShowLabel: false,
    animation: 'none' as const,
    tabBarStyle: [styles.tabBar, { height: 64 + insets.bottom, paddingBottom: Math.max(insets.bottom, 10) }],
  };
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    elevation: 0,
  },
  tabItem: { alignItems: 'center', gap: 4, minWidth: 64 },
  iconWrap: { width: 48, height: 30, borderRadius: theme.radius.full, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: theme.colors.primaryLight },
  tabLabel: { fontSize: 11, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  tabLabelActive: { color: theme.colors.primary, fontFamily: theme.typography.font.semibold },
});
