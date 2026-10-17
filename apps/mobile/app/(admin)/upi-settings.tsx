// app/(admin)/upi-settings.tsx
// ADDED (2026-10-18): UPI QR with the exact amount — Owner setup (Settings → UPI payments)
// USE CASE: Checkout / order screen pe cafe ke UPI ka QR, amount pehle se bhara. 3 steps:
//   1. UPI ID + naam save (sirf Owner — backend bhi authorize("OWNER"); staff apna UPI daal ke
//      paisa nahi le ja sakta, aur har badlaav Audit log mein)
//   2. ₹1 TEST: Owner apne phone se scan karke khud ko ₹1 bheje, aur dekhe UPI app mein SAHI naam
//      aaya. Galat ID = customer ka paisa kisi aur ko — isliye test ke bina QR band rehta hai.
//   3. Verify → ON. UPI ID badla to dobara test (server verify reset karta hai).
// CONNECTED TO: organization.api.ts (setUpi, verifyUpi), outlet.store.ts, components/payments/UpiQr.tsx

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { ArrowLeft, CheckCircle2, QrCode as QrIcon } from 'lucide-react-native';
import { organizationApi, OutletDetails } from '../../features/organization/organization.api';
import { useOutletStore } from '../../features/organization/outlet.store';
import { useScreenLoad } from '../../lib/use-screen-load';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { buildUpiLink, UPI_ID_PATTERN } from '../../lib/upi';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/StateViews';
import { theme } from '../../theme';
import { ui } from '../../theme/ui';

export default function UpiSettingsScreen() {
  const router = useRouter();
  const applyOutlet = useOutletStore((s) => s.applyOutlet);
  const [outlet, setOutlet] = useState<OutletDetails | null>(null);
  const [editing, setEditing] = useState(false);
  const [upiId, setUpiId] = useState('');
  const [upiName, setUpiName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fill = (o: OutletDetails) => {
    setOutlet(o);
    applyOutlet(o); // checkout/order screens turant naya status lein
    setUpiId(o.upiId ?? '');
    setUpiName(o.upiName ?? o.name ?? '');
    setEditing(!o.upiId);
  };

  const { loading, error, retry } = useScreenLoad(async () => {
    if (outlet) return; // edit ke beech focus pe form reset nahi
    fill(await organizationApi.getOutlet());
  });

  const save = async () => {
    if (busy) return;
    const id = upiId.trim().toLowerCase();
    const name = upiName.trim();
    const next: Record<string, string> = {};
    if (!UPI_ID_PATTERN.test(id)) next.upiId = 'Enter a valid UPI ID, like yourname@okaxis';
    if (name.length < 2) next.upiName = 'Enter the name customers should see';
    setErrors(next);
    if (Object.keys(next).length > 0) return haptics.error();
    setBusy(true);
    setFormError(null);
    try {
      fill(await organizationApi.setUpi(id, name));
      haptics.success();
    } catch (err) {
      haptics.error();
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      fill(await organizationApi.verifyUpi());
      haptics.success();
    } catch (err) {
      haptics.error();
      setFormError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = () => {
    Alert.alert('Turn off UPI QR?', 'Checkout will go back to "collect on your café’s QR".', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            fill(await organizationApi.setUpi(null));
          } catch (err) {
            setFormError(getErrorMessage(err));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const verified = !!outlet?.upiVerifiedAt;
  const testLink =
    outlet?.upiId && !verified ? buildUpiLink({ upiId: outlet.upiId, name: outlet.upiName ?? '', amount: 1, note: 'BillRaw test' }) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Back">
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>UPI payments</Text>
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

            {/* Kya hai yeh — ek line */}
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <QrIcon size={20} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>QR with the exact amount</Text>
                  <Text style={styles.hint}>
                    At checkout, customers scan and the bill amount is already filled. Money goes straight to your UPI. BillRaw never touches it.
                  </Text>
                </View>
              </View>
            </View>

            {/* STEP 1 — UPI ID */}
            {editing ? (
              <View style={styles.card}>
                <Text style={styles.step}>Step 1 of 2</Text>
                <TextField
                  label="Your UPI ID"
                  placeholder="e.g. sharmacafe@okaxis"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={upiId}
                  onChangeText={(t) => { setUpiId(t.replace(/\s/g, '')); if (errors.upiId) setErrors((e) => ({ ...e, upiId: '' })); }}
                  error={errors.upiId}
                />
                <TextField
                  label="Name customers will see"
                  placeholder="e.g. Sharma Café"
                  value={upiName}
                  maxLength={50}
                  onChangeText={(t) => { setUpiName(t); if (errors.upiName) setErrors((e) => ({ ...e, upiName: '' })); }}
                  error={errors.upiName}
                />
                <Text style={styles.hint}>
                  Use the UPI ID linked to your soundbox or business account if you have one. Some UPI apps show a warning for personal IDs.
                </Text>
                <View style={{ height: theme.spacing.md }} />
                <Button title="Save and test" onPress={save} loading={busy} />
                {!!outlet.upiId && (
                  <Pressable style={styles.linkBtn} onPress={() => fill(outlet)} accessibilityRole="button">
                    <Text style={styles.linkText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            ) : verified ? (
              /* ON */
              <View style={styles.card}>
                <View style={styles.row}>
                  <CheckCircle2 size={22} color={theme.colors.success} />
                  <Text style={[styles.title, { color: theme.colors.success }]}>UPI QR is on</Text>
                </View>
                <Text style={styles.value}>{outlet.upiName}</Text>
                <Text style={styles.valueSub} selectable>{outlet.upiId}</Text>
                <Text style={styles.hint}>
                  Shows when your staff choose UPI at checkout. Only you can change this, and every change is recorded in Audit logs.
                </Text>
                <View style={styles.btnRow}>
                  <Pressable style={styles.outlineBtn} onPress={() => setEditing(true)} disabled={busy}>
                    <Text style={styles.outlineText}>Change UPI ID</Text>
                  </Pressable>
                  <Pressable style={styles.outlineBtn} onPress={turnOff} disabled={busy}>
                    <Text style={[styles.outlineText, { color: theme.colors.danger }]}>Turn off</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              /* STEP 2 — ₹1 test */
              <View style={styles.card}>
                <Text style={styles.step}>Step 2 of 2 · Test with ₹1</Text>
                <Text style={styles.hint}>
                  1. Open GPay / PhonePe / Paytm on your own phone and scan this QR.{'\n'}
                  2. Check the name shown is <Text style={styles.bold}>yours</Text>, not someone else's.{'\n'}
                  3. Pay ₹1. It goes to your own account.
                </Text>
                {testLink && (
                  <View style={styles.qrWrap}>
                    <QRCode value={testLink} size={190} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
                  </View>
                )}
                <Text style={styles.valueSub} selectable>{outlet.upiId}</Text>
                <View style={{ height: theme.spacing.md }} />
                <Button title="₹1 reached my account, turn it on" onPress={verify} loading={busy} />
                <Pressable style={styles.linkBtn} onPress={() => setEditing(true)} disabled={busy} accessibilityRole="button">
                  <Text style={styles.linkText}>The name was wrong, change UPI ID</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  step: { fontSize: 12, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  hint: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 19 },
  bold: { fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  value: { fontSize: 17, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, marginTop: theme.spacing.md },
  valueSub: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, textAlign: 'center' },
  qrWrap: { alignSelf: 'center', padding: 12, backgroundColor: '#FFFFFF', borderRadius: theme.radius.md, marginTop: theme.spacing.md },
  btnRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  outlineBtn: { flex: 1, height: 44, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.borderStrong, justifyContent: 'center', alignItems: 'center' },
  outlineText: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  linkBtn: { alignSelf: 'center', paddingVertical: theme.spacing.md },
  linkText: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },
});
