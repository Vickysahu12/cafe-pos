// components/payments/UpiQr.tsx
// ADDED (2026-10-18): UPI QR with the exact amount — checkout aur order detail dono pe.
// USE CASE: Customer scan kare → amount pehle se bhara → PIN → paisa seedha cafe ke bank mein.
// BHAROSA (Vicky: "money involve hai, trust jaldi toot ta hai"):
//  - QR sirf tab jab Owner ne UPI ID set + ₹1 self-test (verify) kiya ho — warna yeh component
//    "cafe ka apna QR use karo" wala purana message dikhata hai
//  - App KABHI khud "paid" nahi maanta — cashier soundbox/UPI app dekh ke hi button dabata hai
//    (fake screenshot / amount badalne ka jawab), isliye neeche saaf reminder
//  - UPI ID QR ke neeche hamesha dikhta hai — customer/cashier dekh sake paisa kahan ja raha hai
// CONNECTED TO: lib/upi.ts, outlet.store.ts (upi), checkout.tsx, orders/[id].tsx

import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Smartphone, ShieldCheck } from 'lucide-react-native';
import { useOutletStore } from '../../features/organization/outlet.store';
import { buildUpiLink, UPI_MAX_AMOUNT } from '../../lib/upi';
import { formatINR } from '../../lib/format';
import { theme } from '../../theme';

export function UpiQr({ amount, note }: { amount: number; note?: string }) {
  const upi = useOutletStore((s) => s.upi);
  const load = useOutletStore((s) => s.load);
  // QR dikhne se pehle taaza UPI ID — Owner ne abhi badla/band kiya ho to cashier ka phone purana
  // QR na dikhaye (store sirf layout mount pe load hota tha). Fail (offline) → jo hai wahi.
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const link = upi?.verified ? buildUpiLink({ upiId: upi.id, name: upi.name, amount, note }) : null;

  // UPI set nahi / verify nahi / amount galat → purana behaviour (cafe ka printed QR)
  if (!upi?.verified || !link) {
    return (
      <View style={styles.card}>
        <Smartphone size={30} color={theme.colors.primary} />
        <Text style={styles.title}>Collect {formatINR(amount)} on your café's UPI QR</Text>
        <Text style={styles.note}>
          {upi?.verified && amount > UPI_MAX_AMOUNT
            ? 'This amount is above the UPI limit of ₹1,00,000. Collect it another way.'
            : 'Check the payment arrived (soundbox / UPI app) before confirming.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.amount}>{formatINR(amount)}</Text>
      <Text style={styles.scanText}>Customer scans with any UPI app</Text>
      <View style={styles.qrWrap} accessible accessibilityLabel={`UPI QR code for ${formatINR(amount)} to ${upi.name}`}>
        <QRCode value={link} size={210} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
      </View>
      <Text style={styles.payee}>{upi.name}</Text>
      <Text style={styles.upiId} selectable>{upi.id}</Text>
      <View style={styles.warn}>
        <ShieldCheck size={16} color={theme.colors.warning} />
        <Text style={styles.warnText}>
          Confirm only after your soundbox or UPI app shows {formatINR(amount)} received. Don't trust a screenshot.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  title: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary, textAlign: 'center' },
  note: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, textAlign: 'center' },
  amount: { fontSize: 28, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  scanText: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  qrWrap: { padding: 12, backgroundColor: '#FFFFFF', borderRadius: theme.radius.md, marginVertical: theme.spacing.sm },
  payee: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  upiId: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    alignSelf: 'stretch',
  },
  warnText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: theme.typography.font.medium, color: theme.colors.textPrimary },
});
