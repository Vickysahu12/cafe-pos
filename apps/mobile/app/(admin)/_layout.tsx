// app/(admin)/_layout.tsx
// USE CASE: Bottom tab navigation for Owner/Manager. Elevated, rounded tab bar with
//           proper safe-area spacing and an active-state background pill — avoids the
//           flat, edge-to-edge look and gives each tab clearer visual feedback.
// CONNECTED TO: app/index.tsx redirects here after login/setup.

import { Tabs } from 'expo-router';
import { LayoutDashboard, UtensilsCrossed, Users, Armchair } from 'lucide-react-native';
// UI REDESIGN (2026-10-08): TabIcon + tab bar style ab shared (cashier bhi same use karta hai)
import { TabIcon, useAppTabBarOptions } from '../../components/ui/AppTabBar';

export default function AdminLayout() {
  const tabOptions = useAppTabBarOptions();

  return (
    <Tabs screenOptions={tabOptions}>
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
      {/* FIX (2026-09-29): naye hidden screens — href:null warna tab bar mein aa jaate */}
      <Tabs.Screen name="change-password" options={{ href: null }} />
      <Tabs.Screen name="delete-account" options={{ href: null }} />
      {/* ADDED (2026-09-30): cafe ka customer-ordering QR */}
      <Tabs.Screen name="qr-code" options={{ href: null }} />
      {/* ADDED (2026-09-30): Owner ka 7/30 din Sales Report (Dashboard → Net Revenue) */}
      <Tabs.Screen name="sales-report" options={{ href: null }} />
      {/* ADDED (2026-10-05): Review Booster — Google review link, review card, private feedback */}
      <Tabs.Screen name="reviews" options={{ href: null }} />
      <Tabs.Screen name="orders/[id]" options={{ href: null }} />
      <Tabs.Screen name="orders" options={{ href: null }} />
    </Tabs>
  );
}
