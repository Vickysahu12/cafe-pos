// app/(admin)/delivery-settings.tsx
// ADDED (2026-10-11) — DELIVERY (co-founder brief + Vicky: "apni website se online order"):
// Owner yahan delivery ON karta hai. ON hote hi cafe ki website (order.billraw.in/order/<slug>)
// pe customer ko Takeaway | Delivery ka option dikhta hai.
//  - Default delivery charge (har order pe staff badal sakta hai — order screen pe pencil)
//  - Minimum order (isse kam pe website button band, "₹X aur add karo")
//  - Delivery area text — customer ko dikhta hai ("Within 3 km of the café")
//  - Link share karo (WhatsApp status / Instagram bio) — Swiggy/Zomato commission nahi, apna brand
// Sirf Owner (backend PATCH /organization/outlet authorize("OWNER")). Manager ko read-only nahi
// dikhate — Settings row hi Owner ke liye hai.
// CONNECTED TO: organization.api.ts, lib/config.ts (ORDER_WEB_URL), settings.tsx, apps/web cart page.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Bike, Share2 } from 'lucide-react-native';
import { organizationApi, OutletDetails } from '../../features/organization/organization.api';
import { useScreenLoad } from '../../lib/use-screen-load';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { formatINR } from '../../lib/format';
import { ORDER_WEB_URL } from '../../lib/config';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/StateViews';
import { theme } from '../../theme';
import { ui } from '../../theme/ui';

const money = (t: string) => t.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1').slice(0, 8);

export default function DeliverySettingsScreen() {
  const router = useRouter();
  const [outlet, setOutlet] = useState<OutletDetails | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [charge, setCharge] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [area, setArea] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { loading, error, retry } = useScreenLoad(async () => {
    if (outlet) return; // edit ke beech focus pe form reset nahi
    const o = await organizationApi.getOutlet();
    setOutlet(o);
    setEnabled(!!o.deliveryEnabled);
    setCharge(o.deliveryCharge ? String(o.deliveryCharge) : '');
    setMinOrder(o.deliveryMinOrder ? String(o.deliveryMinOrder) : '');
    setArea(o.deliveryArea ?? '');
  });

  const link = outlet ? `${ORDER_WEB_URL}/order/${outlet.slug}` : '';

  const save = async () => {
    if (saving) return;
    const c = charge.trim() ? Number(charge) : 0;
    const m = minOrder.trim() ? Number(minOrder) : 0;
    const next: Record<string, string> = {};
    if (!Number.isFinite(c) || c < 0) next.charge = 'Enter a valid amount';
    else if (c > 2000) next.charge = 'That charge is too high';
    if (!Number.isFinite(m) || m < 0) next.minOrder = 'Enter a valid amount';
    if (area.trim().length > 80) next.area = 'Keep it under 80 characters';
    setErrors(next);
    if (Object.keys(next).length > 0) return haptics.error();
    setSaving(true);
    setFormError(null);
    try {
      const o = await organizationApi.updateOutlet({
        deliveryEnabled: enabled,
        deliveryCharge: Math.round(c * 100) / 100,
        deliveryMinOrder: Math.round(m * 100) / 100,
        deliveryArea: area.trim() || null,
      });
      setOutlet(o);
      haptics.success();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      haptics.error();
      setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const shareLink = () => {
    if (!outlet) return;
    Share.share({ message: `Order from ${outlet.name} for delivery or takeaway: ${link}` }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Delivery</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading && !outlet ? (
        <View style={styles.content}>
          <Skeleton height={90} radius={theme.radius.lg} />
          <Skeleton height={220} radius={theme.radius.lg} />
        </View>
      ) : !outlet ? (
        <ErrorState message={error ?? 'Could not load your outlet.'} onRetry={retry} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {formError && <ErrorBanner message={formError} />}

            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={styles.icon}>
                  <Bike size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Take delivery orders</Text>
                  <Text style={styles.hint}>Customers can choose Delivery on your ordering website.</Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={(v) => { haptics.tap(); setEnabled(v); }}
                  trackColor={{ true: theme.colors.primary }}
                  accessibilityLabel="Take delivery orders"
                />
              </View>
            </View>

            {enabled && (
              <View style={styles.card}>
                <TextField
                  label="Delivery charge (₹)"
                  placeholder="0 for free delivery"
                  keyboardType="decimal-pad"
                  value={charge}
                  onChangeText={(t) => { setCharge(money(t)); if (errors.charge) setErrors((e) => ({ ...e, charge: '' })); }}
                  error={errors.charge}
                />
                <TextField
                  label="Minimum order (₹, optional)"
                  placeholder="e.g. 200"
                  keyboardType="decimal-pad"
                  value={minOrder}
                  onChangeText={(t) => { setMinOrder(money(t)); if (errors.minOrder) setErrors((e) => ({ ...e, minOrder: '' })); }}
                  error={errors.minOrder}
                />
                <TextField
                  label="Where do you deliver? (optional)"
                  placeholder="e.g. Within 3 km of the café"
                  value={area}
                  maxLength={80}
                  onChangeText={(t) => { setArea(t); if (errors.area) setErrors((e) => ({ ...e, area: '' })); }}
                  error={errors.area}
                />
                <Text style={styles.hint}>
                  Your staff can change the charge on any order before it is paid. Customers pay on delivery, by cash or UPI.
                </Text>
              </View>
            )}

            <Button title={saved ? 'Saved' : 'Save'} onPress={save} loading={saving} />

            {outlet.deliveryEnabled && (
              <View style={styles.card}>
                <Text style={styles.toggleTitle}>Your ordering link</Text>
                <Text style={styles.link} selectable>{link}</Text>
                <Text style={styles.hint}>
                  Share it on WhatsApp, your Instagram bio or Google profile. Orders come straight to you, with no commission.
                  {(outlet.deliveryCharge ?? 0) > 0 ? ` Delivery charge: ${formatINR(outlet.deliveryCharge!)}.` : ' Delivery is free.'}
                </Text>
                <Pressable style={styles.shareBtn} onPress={shareLink} accessibilityRole="button">
                  <Share2 size={16} color={theme.colors.textPrimary} />
                  <Text style={styles.shareText}>Share link</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
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
  card: { ...ui.card, padding: theme.spacing.lg },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  toggleTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  hint: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, lineHeight: 17 },
  link: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk, marginTop: theme.spacing.sm },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, marginTop: theme.spacing.md,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong,
  },
  shareText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
});
