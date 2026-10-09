// components/ui/AppTabBar.tsx
// ADDED (2026-10-08): UI REDESIGN — Owner/Manager AUR Cashier dono ka ek jaisa bottom tab bar.
// USE CASE: pehle admin ka tab bar custom (pill) tha aur cashier ka default system wala
// (alag font, alag rang) — ek hi app do alag apps jaisi lagti thi. Ab dono yahi use karte hain.
//  - Active tab: espresso icon + roast-wash pill + semibold label
//  - Inactive: textSecondary (icon 3:1+ contrast — pehle textMuted bahut halka tha)
//  - Tab switch pe koi animation nahi (din mein saikdon baar — animate-expo rule)
//  - Upar hairline border (shadow ki jagah — warm background pe saaf)
//
// ADDED (2026-10-09): Owner tab bar (Home · Orders · Bill · Reports · More):
//  - `badge`: Orders tab pe live active-order count (99+ cap), espresso pe roast-light text
//  - `BillTabIcon`: beech ka bada espresso button "+" — owner ka sabse zaroori kaam (bill)
//    ek nazar mein; focused hone pe bhi wahi rang (yeh action hai, jagah nahi)

import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../theme';

export function TabIcon({
  Icon,
  focused,
  label,
  badge,
}: {
  Icon: React.ComponentType<{ size: number; color: string }>;
  focused: boolean;
  label: string;
  /** ADDED (2026-10-09): 0/undefined = koi badge nahi */
  badge?: number;
}) {
  return (
    <View style={styles.tabItem} accessibilityLabel={badge ? `${label}, ${badge} active` : label}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Icon size={20} color={focused ? theme.colors.primary : theme.colors.textSecondary} />
        {!!badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** ADDED (2026-10-09): beech ka "Bill" action button */
export function BillTabIcon({ Icon, label }: { Icon: React.ComponentType<{ size: number; color: string }>; label: string }) {
  return (
    <View style={styles.tabItem} accessibilityLabel={label}>
      <View style={styles.billButton}>
        <Icon size={22} color={theme.colors.white} />
      </View>
      <Text style={[styles.tabLabel, styles.tabLabelActive]} numberOfLines={1}>
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
  tabItem: { alignItems: 'center', gap: 4, minWidth: 60 },
  iconWrap: { width: 48, height: 30, borderRadius: theme.radius.full, justifyContent: 'center', alignItems: 'center' },
  iconWrapActive: { backgroundColor: theme.colors.primaryLight },
  tabLabel: { fontSize: 11, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  tabLabelActive: { color: theme.colors.primary, fontFamily: theme.typography.font.semibold },
  badge: {
    position: 'absolute',
    top: -4,
    right: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, lineHeight: 13, fontFamily: theme.typography.font.bold, color: theme.colors.accentLight, fontVariant: ['tabular-nums'] },
  billButton: {
    width: 48,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
