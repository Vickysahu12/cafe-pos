// components/orders/ShareBillSheet.tsx
// ADDED (2026-10-05): "BILL ON WHATSAPP" — payment ke baad customer ko digital bill.
// USE CASE: Cashier customer ka mobile number daalta hai → café ke apne WhatsApp mein
// chat khulti hai, bill ka link (order.billraw.in/bill/<orderId>) message mein ready.
// Cafe ko thermal printer nahi chahiye — chhote cafes ke liye bada selling point.
//
// PRIVACY / SECURITY:
//  - Number SIRF is phone pe use hota hai (wa.me link) — humare server pe kabhi nahi jaata,
//    kahin store nahi hota. Koi customer data collect nahi.
//  - Message cafe ke apne WhatsApp se jaata hai (customer cafe ka number pehchanta hai).
//  - Paise ka koi link nahi — sirf bill (UPI pay jaan-boojh ke nahi, dekho progress8.md).
//  - "Share another way": number na dena chahe to Android share sheet (SMS, Telegram…).
//
// CONNECTED TO: app/(cashier)/orders/[id].tsx (paid order pe button), app/(cashier)/confirmation.tsx
// (checkout ke turant baad), lib/config.ts (ORDER_WEB_URL), apps/web/app/bill/[orderId]/page.tsx.

import { useEffect, useState } from 'react';
import { Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { MessageCircle, Phone, Share2 } from 'lucide-react-native';
import { BottomSheet } from '../ui/BottomSheet';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { ORDER_WEB_URL } from '../../lib/config';
import { useAuthStore } from '../../features/auth/auth.store';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';

import { formatINR } from '../../lib/format'; // UI REDESIGN (2026-10-08): ₹1,250 format, float ka kachra nahi
interface ShareBillSheetProps {
  visible: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: number | string;
  netAmount: number | string;
  /** ADDED (2026-10-06): QR order pe customer ne jo number diya — pehle se bhara hua (type nahi karna) */
  initialPhone?: string | null;
}

export const billUrl = (orderId: string) => `${ORDER_WEB_URL}/bill/${orderId}`;

/**
 * "+91 98765-43210", "098765 43210", "9876543210" → "9876543210".
 * Indian mobile: 10 digits, 6/7/8/9 se shuru. Galat ho to null.
 */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function ShareBillSheet({ visible, onClose, orderId, orderNumber, netAmount, initialPhone }: ShareBillSheetProps) {
  const outletName = useAuthStore((s) => s.user?.outletName);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();

  // ADDED (2026-10-06): sheet khulte hi customer ka number (agar QR order pe diya tha) bhar do
  useEffect(() => {
    // sheet open hone pe ek baar prefill (cashier chahe to number badal sakta hai)
    if (visible && initialPhone) setPhone(initialPhone);
  }, [visible, initialPhone]);

  const message =
    `${outletName ? `Thank you for visiting ${outletName}! 🙏` : 'Thank you for your visit! 🙏'}\n` +
    `Your bill #${orderNumber}: ${formatINR(Number(netAmount))}\n\n` +
    `View your bill: ${billUrl(orderId)}`;

  const close = () => {
    setPhone('');
    setError(undefined);
    onClose();
  };

  const sendOnWhatsApp = async () => {
    const mobile = normalizeIndianMobile(phone);
    if (!mobile) {
      setError('Enter a valid 10-digit mobile number');
      haptics.error();
      return;
    }
    // wa.me: WhatsApp (ya WhatsApp Business) installed ho to wahi khulta hai, warna browser
    const url = `https://wa.me/91${mobile}?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
      haptics.success();
      close();
    } catch {
      setError("Couldn't open WhatsApp. Try 'Share another way'.");
    }
  };

  const shareOtherWay = async () => {
    try {
      await Share.share({ message });
      close();
    } catch {
      // user ne share sheet band kar di — kuch nahi karna
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="Send bill on WhatsApp">
      <Text style={styles.hint}>
        The customer gets a link to bill #{orderNumber} ({formatINR(Number(netAmount))}) from your WhatsApp. The number isn't saved anywhere.
      </Text>

      <TextField
        label="Customer's mobile number"
        icon={Phone}
        placeholder="98765 43210"
        keyboardType="phone-pad"
        autoFocus
        maxLength={16}
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          if (error) setError(undefined);
        }}
        error={error}
        onSubmitEditing={sendOnWhatsApp}
        returnKeyType="send"
      />

      <Button title="Send on WhatsApp" onPress={sendOnWhatsApp} style={styles.whatsappBtn} />

      <Pressable style={styles.secondary} onPress={shareOtherWay} hitSlop={6}>
        <Share2 size={16} color={theme.colors.textSecondary} />
        <Text style={styles.secondaryText}>Share another way</Text>
      </Pressable>
    </BottomSheet>
  );
}

/** Paid order pe dikhne wala button — order detail + confirmation dono jagah same */
export function SendBillButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
      accessibilityRole="button"
      accessibilityLabel="Send bill on WhatsApp"
    >
      <View style={styles.sendIcon}>
        <MessageCircle size={18} color="#FFFFFF" />
      </View>
      <Text style={styles.sendText}>Send bill on WhatsApp</Text>
    </Pressable>
  );
}

// WhatsApp ka pehchana hua hara — button turant samajh aata hai
const WHATSAPP_GREEN = '#1FA855';

const styles = StyleSheet.create({
  hint: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: theme.spacing.md },
  whatsappBtn: { backgroundColor: WHATSAPP_GREEN },
  secondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: theme.spacing.md, marginTop: theme.spacing.xs },
  secondaryText: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: WHATSAPP_GREEN,
    marginBottom: theme.spacing.md,
  },
  sendIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  sendText: { color: '#FFFFFF', fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold},
});
