// app/(admin)/more.tsx
// ADDED (2026-10-09): Owner/Manager ka "More" tab.
// USE CASE: Tab bar ab roz ke kaam ke liye hai (Home · Orders · Bill · Reports). Jo cheezein
// ek baar set karke kabhi-kabhi kholte hain (Menu, Staff, Tables, Stock, QR, Reviews, Audit,
// Settings) woh yahan — saaf 2-column grid, har tile pe icon + ek line ka kaam.
// Groups: Manage (roz ka setup) · Grow (customers) · Account.
// Role: Reviews = Owner+Manager, Audit logs = sirf Owner (backend bhi yahi enforce karta hai).

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  UtensilsCrossed, Users, Armchair, Package, QrCode, Star, ScrollText, Settings, ChevronRight,
} from 'lucide-react-native';
import { useAuthStore } from '../../features/auth/auth.store';
import { PressScale } from '../../components/ui/PressScale';
import { theme } from '../../theme';

type Tile = {
  key: string;
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  desc: string;
  href: string;
  show?: boolean;
};

export default function MoreScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isOwner = user?.role === 'OWNER';

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: 'Manage',
      tiles: [
        { key: 'menu', icon: UtensilsCrossed, title: 'Menu', desc: 'Items, prices, sizes', href: '/(admin)/menu' },
        { key: 'staff', icon: Users, title: 'Staff', desc: 'Logins and roles', href: '/(admin)/staff' },
        { key: 'tables', icon: Armchair, title: 'Tables', desc: 'Dine-in tables', href: '/(admin)/tables' },
        { key: 'stock', icon: Package, title: 'Stock', desc: 'Inventory and alerts', href: '/(admin)/inventory' },
      ],
    },
    {
      title: 'Grow',
      tiles: [
        { key: 'qr', icon: QrCode, title: 'QR codes', desc: 'Table and counter QR', href: '/(admin)/qr-code' },
        { key: 'reviews', icon: Star, title: 'Reviews', desc: 'Google reviews, feedback', href: '/(admin)/reviews' },
      ],
    },
    {
      title: 'Account',
      tiles: [
        { key: 'audit', icon: ScrollText, title: 'Audit logs', desc: 'Discounts, voids, changes', href: '/(admin)/audit-logs', show: isOwner },
        { key: 'settings', icon: Settings, title: 'Settings', desc: 'Outlet, password, legal', href: '/(admin)/settings' },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>More</Text>
        {!!user?.outletName && <Text style={styles.subtitle}>{user.outletName}</Text>}

        {groups.map((g) => {
          const tiles = g.tiles.filter((t) => t.show !== false);
          if (tiles.length === 0) return null;
          return (
            <View key={g.title} style={styles.group}>
              <Text style={styles.groupTitle}>{g.title}</Text>
              <View style={styles.grid}>
                {tiles.map((t) => (
                  <PressScale
                    key={t.key}
                    style={styles.tile}
                    onPress={() => router.push(t.href as never)}
                    accessibilityLabel={`${t.title}. ${t.desc}`}
                  >
                    <View style={styles.tileTop}>
                      <View style={styles.tileIcon}>
                        <t.icon size={20} color={theme.colors.primary} />
                      </View>
                      <ChevronRight size={16} color={theme.colors.textMuted} />
                    </View>
                    <Text style={styles.tileTitle}>{t.title}</Text>
                    <Text style={styles.tileDesc} numberOfLines={1}>{t.desc}</Text>
                  </PressScale>
                ))}
                {/* odd count pe aakhri tile poori width na le — grid barabar rahe */}
                {tiles.length % 2 === 1 && <View style={[styles.tile, styles.tileSpacer]} />}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary },
  subtitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4 },

  group: { marginTop: theme.spacing.xl },
  groupTitle: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: {
    width: '48.5%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
  },
  tileSpacer: { backgroundColor: 'transparent', borderWidth: 0 },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  tileIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  tileTitle: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  tileDesc: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2 },
});
