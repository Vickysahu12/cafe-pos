// components/delivery/SendToDeliverySheet.tsx
// ADDED (2026-10-18): WHATSAPP DELIVERY LINK — "Who is delivering?" sheet (order screen se)
// USE CASE: Cashier counter pe hai, delivery boy (Raju) deliver karega. Yahan Raju chuno → WhatsApp
// khulta hai message ke saath (address, Maps pin, kitna lena hai, "Delivered" link) → Send.
// Order turant "Out for delivery · Raju". Raju ko app/login kuch nahi chahiye.
//  - Saved list: pehli baar naam + number, agli baar ek tap
//  - "I'll deliver myself": Solo owner / cashier khud gaya — koi link nahi, app se "Mark delivered"
//  - Change person: naya link jaata hai, purane wale ka link TURANT band (server)
//  - Remove person: sirf Owner/Manager (backend bhi yahi)
// CONNECTED TO: delivery.api.ts, lib/delivery-message.ts, app/(cashier)/orders/[id].tsx

import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { Bike, Check, Plus, Trash2, UserRound } from 'lucide-react-native';
import { BottomSheet } from '../ui/BottomSheet';
import { TextField } from '../ui/TextField';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/ErrorBanner';
import { deliveryApi, DeliveryPerson } from '../../features/delivery/delivery.api';
import type { OrderResponse } from '../../features/orders/orders.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { buildDeliveryMessage, openWhatsApp } from '../../lib/delivery-message';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';

const SELF = '__self__';
const prettyPhone = (p: string) => `+91 ${p.slice(0, 5)} ${p.slice(5)}`;
const toTenDigits = (t: string) => {
  const d = t.replace(/\D/g, '');
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2) : d.length === 11 && d.startsWith('0') ? d.slice(1) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
};

export function SendToDeliverySheet({
  visible,
  onClose,
  order,
  onDispatched,
}: {
  visible: boolean;
  onClose: () => void;
  order: OrderResponse;
  onDispatched: (order: OrderResponse) => void;
}) {
  const user = useAuthStore((s) => s.user);
  const canRemove = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const changing = order.deliveryStatus === 'OUT_FOR_DELIVERY';

  const [people, setPeople] = useState<DeliveryPerson[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    deliveryApi
      .listPeople()
      .then((list) => {
        setPeople(list);
        if (list.length === 0) setAdding(true); // pehli baar — seedha form
      })
      .catch((err) => setLoadError(getErrorMessage(err)));
  };

  // Har baar khulne pe taaza list + saaf form
  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setAdding(false);
    setName('');
    setPhone('');
    setErrors({});
    setError(null);
    load();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const savePerson = async () => {
    const ten = toTenDigits(phone);
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Enter a name';
    if (!ten) next.phone = 'Enter a valid 10-digit WhatsApp number';
    setErrors(next);
    if (Object.keys(next).length > 0) return haptics.error();
    setBusy(true);
    setError(null);
    try {
      const p = await deliveryApi.addPerson(name.trim(), ten!);
      setPeople((prev) => [...(prev ?? []).filter((x) => x.id !== p.id), p].sort((a, b) => a.name.localeCompare(b.name)));
      setSelected(p.id);
      setAdding(false);
      setName('');
      setPhone('');
      haptics.success();
    } catch (err) {
      haptics.error();
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = (p: DeliveryPerson) => {
    Alert.alert(`Remove ${p.name}?`, 'You can add them again anytime. Orders they already have keep working.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deliveryApi.removePerson(p.id);
            setPeople((prev) => (prev ?? []).filter((x) => x.id !== p.id));
            if (selected === p.id) setSelected(null);
          } catch (err) {
            setError(getErrorMessage(err));
          }
        },
      },
    ]);
  };

  const send = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await deliveryApi.dispatch(order.id, selected === SELF ? { self: true } : { deliveryPersonId: selected });
      onDispatched(result.order);
      haptics.success();
      onClose();
      if (result.token && result.personPhone) {
        const msg = buildDeliveryMessage(result.order, user?.outletName ?? 'our café', result.token);
        await openWhatsApp(result.personPhone, msg);
      }
    } catch (err) {
      haptics.error();
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const current = order.deliveryPersonName;

  return (
    <BottomSheet visible={visible} onClose={() => !busy && onClose()} title={changing ? 'Change delivery person' : 'Who is delivering?'}>
      <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
        {error && <ErrorBanner message={error} />}
        {changing && current && (
          <Text style={styles.note}>
            Now with {current}. Sending to someone else stops {current}&apos;s link right away.
          </Text>
        )}

        {/* Main khud */}
        <Row
          active={selected === SELF}
          onPress={() => setSelected(SELF)}
          icon={<Bike size={18} color={theme.colors.primary} />}
          title="I'll deliver it myself"
          subtitle="No link. Tap Mark delivered in the app when done."
        />

        {people === null && !loadError && <ActivityIndicator style={{ marginVertical: theme.spacing.lg }} color={theme.colors.primary} />}
        {loadError && (
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Couldn&apos;t load the list. Tap to retry.</Text>
          </Pressable>
        )}

        {people?.map((p) => (
          <Row
            key={p.id}
            active={selected === p.id}
            onPress={() => setSelected(p.id)}
            icon={<UserRound size={18} color={theme.colors.primary} />}
            title={p.name}
            subtitle={prettyPhone(p.phone)}
            trailing={
              canRemove ? (
                <Pressable onPress={() => remove(p)} hitSlop={10} accessibilityLabel={`Remove ${p.name}`}>
                  <Trash2 size={16} color={theme.colors.textMuted} />
                </Pressable>
              ) : null
            }
          />
        ))}

        {adding ? (
          <View style={styles.addCard}>
            <TextField
              label="Name"
              placeholder="e.g. Raju"
              value={name}
              maxLength={40}
              onChangeText={(t) => { setName(t); if (errors.name) setErrors((e) => ({ ...e, name: '' })); }}
              error={errors.name}
            />
            <TextField
              label="WhatsApp number"
              placeholder="10-digit mobile number"
              keyboardType="phone-pad"
              value={phone}
              maxLength={16}
              onChangeText={(t) => { setPhone(t); if (errors.phone) setErrors((e) => ({ ...e, phone: '' })); }}
              error={errors.phone}
            />
            <Button title="Save" variant="secondary" onPress={savePerson} loading={busy} />
          </View>
        ) : (
          people !== null && (
            <Pressable style={styles.addBtn} onPress={() => setAdding(true)} accessibilityRole="button">
              <Plus size={16} color={theme.colors.accentInk} />
              <Text style={styles.addText}>Add delivery person</Text>
            </Pressable>
          )
        )}
      </ScrollView>

      <Text style={styles.hint}>
        {selected === SELF
          ? 'The order is marked out for delivery.'
          : 'WhatsApp opens with the address, map, amount to collect and a link to tap when delivered. No app needed for them.'}
      </Text>
      <Button
        title={!selected ? 'Choose who is delivering' : selected === SELF ? "I'm delivering it" : 'Send on WhatsApp'}
        onPress={send}
        loading={busy}
        disabled={!selected}
      />
    </BottomSheet>
  );
}

function Row({
  active,
  onPress,
  icon,
  title,
  subtitle,
  trailing,
}: {
  active: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      {trailing}
      <View style={[styles.radio, active && styles.radioActive]}>{active && <Check size={13} color={theme.colors.white} />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    minHeight: 60,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  rowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  rowSub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: theme.colors.borderStrong, justifyContent: 'center', alignItems: 'center' },
  radioActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: theme.spacing.sm },
  addText: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.accentInk },
  addCard: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.sm },
  retry: { paddingVertical: theme.spacing.md },
  retryText: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.danger },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginVertical: theme.spacing.md },
});
