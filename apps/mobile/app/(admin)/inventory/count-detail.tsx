// app/(admin)/inventory/count-detail.tsx
// ADDED (2026-10-09) — STOCK SOP: ek purane stock count ki poori detail — wahi CountResult jo save
// ke turant baad dikhta hai (dono jagah same numbers, same design).
// CONNECTED TO: inventory.api.ts (getCount), components/inventory/CountResult.tsx, count-history.tsx

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { inventoryApi, StockCountResult } from '../../../features/inventory/inventory.api';
import { useScreenLoad } from '../../../lib/use-screen-load';
import { Skeleton } from '../../../components/ui/Skeleton';
import { ErrorState } from '../../../components/ui/StateViews';
import { CountResult } from '../../../components/inventory/CountResult';
import { shortDateTime as formatCountDate } from '../../../lib/format';
import { theme } from '../../../theme';
import { ui } from '../../../theme/ui';

export default function CountDetailScreen() {
  const router = useRouter();
  const { countId } = useLocalSearchParams<{ countId: string }>();
  const [result, setResult] = useState<StockCountResult | null>(null);
  const { loading, error, retry } = useScreenLoad(async () => {
    setResult(await inventoryApi.getCount(countId));
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Stock count</Text>
        <View style={{ width: 40 }} />
      </View>
      {loading && !result ? (
        <View style={styles.content}>
          <Skeleton height={120} radius={theme.radius.lg} />
          <Skeleton height={220} radius={theme.radius.lg} />
        </View>
      ) : !result ? (
        <ErrorState message={error ?? 'Count not found.'} onRetry={retry} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.meta}>
            {result.at ? formatCountDate(result.at) : ''}
            {result.by ? ` · by ${result.by}` : ''}
          </Text>
          {!!result.note && <Text style={styles.note}>"{result.note}"</Text>}
          <CountResult result={result} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { ...ui.headerBar },
  headerTitle: { ...ui.headerTitle },
  iconBtn: { ...ui.iconButton },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl, gap: theme.spacing.md },
  meta: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, fontVariant: ['tabular-nums'] },
  note: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
});
