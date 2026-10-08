// app/(cashier)/_layout.tsx
// USE CASE: Cashier's persistent navigation. Billing (create a walk-in order) and
// Orders (full list of live orders + Serve) are both one tap away. Everything
// else is a step inside a flow, not a destination, so it's hidden from the tab
// bar with href: null — same pattern as (admin)/_layout.tsx:
//   • cart / checkout / confirmation → steps of the Billing (walk-in) flow
//   • orders/[id]                    → detail screen opened from the live strip or Orders list
// Without hiding orders/[id], Expo Router auto-adds it as an extra tab.

import { Tabs } from 'expo-router';
import { ShoppingCart, ClipboardList } from 'lucide-react-native';
// UI REDESIGN (2026-10-08): admin jaisa hi tab bar (pehle default system style tha — alag font/rang)
import { TabIcon, useAppTabBarOptions } from '../../components/ui/AppTabBar';

export default function CashierLayout() {
  const tabOptions = useAppTabBarOptions();
  return (
    <Tabs screenOptions={tabOptions}>
      <Tabs.Screen
        name="billing"
        options={{
          title: 'Billing',
          tabBarIcon: ({ focused }) => <TabIcon Icon={ShoppingCart} focused={focused} label="Billing" />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ focused }) => <TabIcon Icon={ClipboardList} focused={focused} label="Orders" />,
        }}
      />

      <Tabs.Screen name="orders/[id]" options={{ href: null }} />
      <Tabs.Screen name="cart" options={{ href: null }} />
      <Tabs.Screen name="checkout" options={{ href: null }} />
      <Tabs.Screen name="confirmation" options={{ href: null }} />
    </Tabs>
  );
}