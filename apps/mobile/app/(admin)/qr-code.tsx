// app/(admin)/qr-code.tsx
// USE CASE (2026-09-30): Owner/Manager ka "My QR Code" screen. Har cafe ka apna
// unique QR — outlet ka `slug` (signup pe auto-bana, jaise "sharma-cafe") customer
// website ke link mein jaata hai: https://order.billraw.in/order/sharma-cafe
// Customer scan kare → usi cafe ka menu khulta hai. Menu/price badalne pe QR
// dobara print karne ki zaroorat NAHI — link same rehta hai, menu live load hota hai.
// CONNECTED TO: organization.api.ts (getOutlet → slug), lib/config.ts (ORDER_WEB_URL),
//               apps/web/app/order/[slug] (jo page khulta hai). Settings → My QR Code.
//
// FIX (2026-09-30): PER-TABLE QR. Upar chips: "Counter" (takeaway, table ke bina) +
// har table. Table QR = `.../order/<slug>?table=<tableId>` — customer ka order seedha
// DINE_IN us table ke saath kitchen/cashier ko jaata hai (pehle har QR order takeaway
// hota tha aur cashier ko pata nahi hota kis table pe dena hai).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Share, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, Share2, ExternalLink, Printer } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { organizationApi, OutletDetails } from '../../features/organization/organization.api';
import { tablesApi, Table } from '../../features/tables/tables.api';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { getErrorMessage } from '../../lib/api-client';
import { ORDER_WEB_URL } from '../../lib/config';
import { theme } from '../../theme';

import { ui } from '../../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
export default function QrCodeScreen() {
  const router = useRouter();
  const [outlet, setOutlet] = useState<OutletDetails | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  // null = Counter/takeaway QR
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      organizationApi
        .getOutlet()
        .then(setOutlet)
        .catch((err) => setError(getErrorMessage(err)));
      // Tables optional — fail ho to bhi counter QR kaam kare
      tablesApi
        .getTables()
        .then((list) => setTables([...list].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true }))))
        .catch(() => {});
    }, [])
  );

  const baseUrl = outlet ? `${ORDER_WEB_URL}/order/${outlet.slug}` : '';
  const menuUrl = selectedTable ? `${baseUrl}?table=${selectedTable.id}` : baseUrl;
  const tableLabel = selectedTable
    ? /^t/i.test(selectedTable.tableNumber) ? selectedTable.tableNumber : `Table ${selectedTable.tableNumber}`
    : null;

  const handleShare = () => {
    if (!outlet) return;
    Share.share({
      message: `Order from ${outlet.name}${tableLabel ? ` (${tableLabel})` : ''} — scan or open: ${menuUrl}`,
      url: menuUrl, // iOS link preview
    }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>My QR Code</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error && <ErrorBanner message={error} />}

        {!outlet && !error ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 80 }} />
        ) : outlet ? (
          <>
            {/* Counter + har table ka QR */}
            {tables.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {[null, ...tables].map((t) => {
                  const active = (t?.id ?? null) === (selectedTable?.id ?? null);
                  return (
                    <Pressable
                      key={t?.id ?? 'counter'}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setSelectedTable(t)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {t ? (/^t/i.test(t.tableNumber) ? t.tableNumber : `Table ${t.tableNumber}`) : 'Counter'}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Print-friendly card — screenshot lo aur print/sticker banwao */}
            <View style={styles.qrCard}>
              <Text style={styles.cafeName}>{outlet.name}</Text>
              {tableLabel && <Text style={styles.tableBadge}>{tableLabel}</Text>}
              <Text style={styles.scanText}>Scan to see the menu & order</Text>
              <View style={styles.qrWrap}>
                <QRCode value={menuUrl} size={220} backgroundColor="#FFFFFF" color="#1A140E" ecl="M" />
              </View>
              <Text style={styles.urlText} selectable>{menuUrl.replace(/^https?:\/\//, '')}</Text>
              <Text style={styles.poweredBy}>Powered by BillRaw</Text>
            </View>

            <Pressable style={styles.primaryButton} onPress={handleShare}>
              <Share2 size={18} color={theme.colors.white} />
              <Text style={styles.primaryButtonText}>Share Menu Link</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => Linking.openURL(menuUrl)}>
              <ExternalLink size={17} color={theme.colors.primary} />
              <Text style={styles.secondaryButtonText}>Open Menu (preview)</Text>
            </Pressable>

            <View style={styles.tipCard}>
              <Printer size={18} color={theme.colors.textSecondary} />
              <Text style={styles.tipText}>
                {tables.length > 0
                  ? 'Print one QR per table (orders arrive with the table number) and the Counter QR for takeaway. Take a screenshot of each card to print. QRs never change — menu and price updates show up automatically.'
                  : 'Take a screenshot of the card above and print it for your counter. Add tables in the Tables tab to get a separate QR for each table. QRs never change — menu and price updates show up automatically.'}
              </Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  chipRow: { gap: theme.spacing.sm, paddingBottom: theme.spacing.lg },
  chip: {
    paddingHorizontal: theme.spacing.md, height: 36, justifyContent: 'center', borderRadius: theme.radius.full,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface,
  },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.white },
  tableBadge: {
    marginTop: theme.spacing.xs, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.bold,
    color: theme.colors.primary, backgroundColor: theme.colors.primaryLight, overflow: 'hidden',
    paddingHorizontal: theme.spacing.md, paddingVertical: 4, borderRadius: theme.radius.full,
  },
  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },
  content: { padding: theme.spacing.lg, alignItems: 'stretch' },
  qrCard: {
    backgroundColor: '#FFFFFF', borderRadius: theme.radius.lg + 4, borderWidth: 1, borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.lg, alignItems: 'center', marginBottom: theme.spacing.xl,
    shadowColor: '#2B1F14', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cafeName: {
    fontSize: theme.typography.size.xxl, fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary, textAlign: 'center',
  },
  scanText: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4, marginBottom: theme.spacing.lg },
  qrWrap: { padding: theme.spacing.md, backgroundColor: '#FFFFFF', borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border },
  urlText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: theme.spacing.lg, textAlign: 'center' },
  poweredBy: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginTop: theme.spacing.sm },
  primaryButton: {
    flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  primaryButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
  secondaryButton: {
    flexDirection: 'row', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, marginTop: theme.spacing.sm,
    borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: 'center', alignItems: 'center',
  },
  secondaryButtonText: { color: theme.colors.primary, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
  tipCard: {
    flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xl, padding: theme.spacing.md,
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  tipText: { flex: 1, fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20 },
});
