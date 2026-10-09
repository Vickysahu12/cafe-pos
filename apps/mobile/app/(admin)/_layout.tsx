// app/(admin)/_layout.tsx
// USE CASE: Bottom tab navigation for Owner/Manager.
// CONNECTED TO: app/index.tsx redirects here after login/setup.
//
// UI REDESIGN (2026-10-09) — TAB BAR = ROZ KE KAAM:
//   Owner:   Home · Orders · [ + Bill ] · Reports · More
//   Manager: Home · Orders · [ + Bill ] · Stock   · More   (sales report backend pe Owner-only hai)
//  - Pehle Home · Menu · Staff · Tables tha — Staff/Tables hafte mein ek baar khulte hain, par
//    best jagah le rahe the; roz ke kaam (orders dekhna, bill karna, sales) ka koi tab nahi tha.
//  - Orders tab pe live badge (abhi chal rahe orders) — features/orders/useActiveOrderCount.ts
//  - Bill: chhote cafe mein owner khud counter pe bill karta hai — cashier wali screens reuse
//    ((admin)/billing.tsx re-export + lib/use-flow-base.ts)
//  - Menu, Staff, Tables, Stock, QR, Reviews, Audit, Settings → "More" grid (app/(admin)/more.tsx)
//  - backBehavior "history": More → Menu → back = More pe wapas (default Home pe le jaata tha)
//  - ADDED (2026-10-09): QrOrderAlert — customer QR se order kare to HAR screen pe chime + banner
//    (Owner/Manager ka phone). Tabs ke upar overlay, isliye Tabs ko ek View mein lapeta.

import { View } from 'react-native';
import { Tabs } from 'expo-router';
import { LayoutDashboard, ClipboardList, Plus, BarChart3, Package, LayoutGrid } from 'lucide-react-native';
import { TabIcon, BillTabIcon, useAppTabBarOptions } from '../../components/ui/AppTabBar';
import { useAuthStore } from '../../features/auth/auth.store';
import { useActiveOrderCount } from '../../features/orders/useActiveOrderCount';
import { QrOrderAlert } from '../../components/orders/QrOrderAlert';
// ADDED (2026-10-09): Stock SOP — live low-stock toast + Manager ke Stock tab pe badge
import { StockAlertBanner } from '../../components/inventory/StockAlertBanner';
import { useLowStockCount } from '../../features/inventory/useLowStockCount';

export default function AdminLayout() {
  const tabOptions = useAppTabBarOptions();
  const isOwner = useAuthStore((s) => s.user?.role) === 'OWNER';
  const activeOrders = useActiveOrderCount();
  const lowStock = useLowStockCount(!isOwner); // Owner ka Stock tab nahi (More mein) — wahan Home card dikhata hai

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={tabOptions} backBehavior="history">
        <Tabs.Screen
          name="dashboard"
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={LayoutDashboard} focused={focused} label="Home" /> }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            tabBarIcon: ({ focused }) => <TabIcon Icon={ClipboardList} focused={focused} label="Orders" badge={activeOrders} />,
          }}
        />
        <Tabs.Screen
          name="billing"
          options={{ tabBarIcon: () => <BillTabIcon Icon={Plus} label="Bill" /> }}
        />
        {/* Owner: Reports tab · Manager: Stock tab (doosra hidden) */}
        <Tabs.Screen
          name="sales-report"
          options={{
            href: isOwner ? undefined : null,
            tabBarIcon: ({ focused }) => <TabIcon Icon={BarChart3} focused={focused} label="Reports" />,
          }}
        />
        <Tabs.Screen
          name="inventory"
          options={{
            href: isOwner ? null : undefined,
            tabBarIcon: ({ focused }) => <TabIcon Icon={Package} focused={focused} label="Stock" badge={lowStock} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={LayoutGrid} focused={focused} label="More" /> }}
        />

        {/* Hidden (More grid / Dashboard se khulte hain) — href:null warna tab bar mein aa jaate */}
        <Tabs.Screen name="menu" options={{ href: null }} />
        <Tabs.Screen name="staff" options={{ href: null }} />
        <Tabs.Screen name="tables" options={{ href: null }} />
        <Tabs.Screen name="setup" options={{ href: null }} />
        <Tabs.Screen name="audit-logs" options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
        <Tabs.Screen name="subscription" options={{ href: null }} />
        <Tabs.Screen name="outlet-edit" options={{ href: null }} />
        <Tabs.Screen name="change-password" options={{ href: null }} />
        <Tabs.Screen name="delete-account" options={{ href: null }} />
        <Tabs.Screen name="qr-code" options={{ href: null }} />
        <Tabs.Screen name="reviews" options={{ href: null }} />
        <Tabs.Screen name="orders/[id]" options={{ href: null }} />
        {/* ADDED (2026-10-09): Bill flow ki baaki screens (cashier wali reuse) */}
        <Tabs.Screen name="cart" options={{ href: null }} />
        <Tabs.Screen name="checkout" options={{ href: null }} />
        <Tabs.Screen name="confirmation" options={{ href: null }} />
      </Tabs>
      <QrOrderAlert base="/(admin)" />
      <StockAlertBanner />
    </View>
  );
}
