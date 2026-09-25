// app/(admin)/_layout.tsx
// USE CASE: Bottom tab navigation for Owner/Manager. Elevated, rounded tab bar with
//           proper safe-area spacing and an active-state background pill — avoids the
//           flat, edge-to-edge look and gives each tab clearer visual feedback.
// CONNECTED TO: app/index.tsx redirects here after login/setup.

import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutDashboard, UtensilsCrossed, Users, Armchair } from 'lucide-react-native';
import { theme } from '../../theme';

function TabIcon({
  Icon,
  focused,
  label,
}: {
  Icon: React.ComponentType<{ size: number; color: string }>;
  focused: boolean;
  label: string;
}) {
  return (
    <View style={styles.tabItem}>
      <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
        <Icon size={20} color={focused ? theme.colors.primary : theme.colors.textMuted} />
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function AdminLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 64 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ],
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={LayoutDashboard} focused={focused} label="Home" /> }}
      />
      <Tabs.Screen
        name="menu"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={UtensilsCrossed} focused={focused} label="Menu" /> }}
      />
      <Tabs.Screen
        name="staff"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} label="Staff" /> }}
      />
      <Tabs.Screen
        name="tables"
        options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Armchair} focused={focused} label="Tables" /> }}
      />

      <Tabs.Screen name="setup" options={{ href: null }} />
      <Tabs.Screen name="inventory" options={{ href: null }} />
      <Tabs.Screen name="audit-logs" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="subscription" options={{ href: null }} />
      <Tabs.Screen name="outlet-edit" options={{ href: null }} />
      <Tabs.Screen name="legal/privacy" options={{ href: null }} />
      <Tabs.Screen name="legal/terms" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 0,
    paddingTop: 10,
    // Soft shadow lifts the bar off the screen instead of a flat, glued-on line
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  tabItem: { alignItems: 'center', gap: 4, minWidth: 56 },
  iconWrap: {
    width: 40,
    height: 32,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrapActive: { backgroundColor: theme.colors.primaryLight },
  tabLabel: { fontSize: 11, fontWeight: theme.typography.weight.medium, color: theme.colors.textMuted },
  tabLabelActive: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold },
});