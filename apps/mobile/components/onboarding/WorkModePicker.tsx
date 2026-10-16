// components/onboarding/WorkModePicker.tsx
// ADDED (2026-10-17): SOLO / TEAM chunne wala card — "Just me" ya "With staff".
// USE CASE: Stall / cloud kitchen / chhota cafe jahan ek hi banda order leta, banata aur deliver karta
// hai — use Staff, Chef screen, Audit logs ka clutter nahi chahiye. Setup (naya cafe) aur Dashboard
// (purana cafe jisne abhi chuna nahi) pe ek baar dikhta hai; Settings se kabhi bhi badal sakte hain.
// Edge: active staff ke saath "Just me" → server 409 STAFF_EXISTS → saaf message (kaun se staff).
// CONNECTED TO: outlet.store.ts, setup.tsx, dashboard.tsx, settings.tsx

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { User, Users, Check } from 'lucide-react-native';
import { useOutletStore } from '../../features/organization/outlet.store';
import type { WorkMode } from '../../features/organization/organization.api';
import { getErrorMessage } from '../../lib/api-client';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';

const OPTIONS: { mode: WorkMode; title: string; desc: string; Icon: React.ComponentType<{ size: number; color: string }> }[] = [
  {
    mode: 'SOLO',
    title: 'Just me',
    desc: 'I take orders, cook and deliver myself. Stall, cloud kitchen or small café.',
    Icon: User,
  },
  {
    mode: 'TEAM',
    title: 'With staff',
    desc: 'Cashier, chef or manager log in on their own phones.',
    Icon: Users,
  },
];

export function WorkModePicker({ title = 'How do you run your café?', onDone }: { title?: string; onDone?: (mode: WorkMode) => void }) {
  const current = useOutletStore((s) => s.workMode);
  const setWorkMode = useOutletStore((s) => s.setWorkMode);
  const [saving, setSaving] = useState<WorkMode | null>(null);

  const choose = async (mode: WorkMode) => {
    if (saving || mode === current) return;
    setSaving(mode);
    try {
      await setWorkMode(mode);
      haptics.success();
      onDone?.(mode);
    } catch (err) {
      haptics.error();
      Alert.alert("Couldn't change", getErrorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <View>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.hint}>You can change this anytime in Settings.</Text>
      <View style={styles.row}>
        {OPTIONS.map(({ mode, title: t, desc, Icon }) => {
          const active = current === mode;
          return (
            <Pressable
              key={mode}
              style={({ pressed }) => [styles.card, active && styles.cardActive, pressed && { transform: [{ scale: 0.98 }] }]}
              onPress={() => choose(mode)}
              disabled={!!saving}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t}. ${desc}`}
            >
              <View style={styles.cardTop}>
                <View style={[styles.iconWrap, active && { backgroundColor: theme.colors.primary }]}>
                  <Icon size={20} color={active ? theme.colors.white : theme.colors.primary} />
                </View>
                {saving === mode ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : active ? (
                  <Check size={18} color={theme.colors.primary} />
                ) : null}
              </View>
              <Text style={styles.cardTitle}>{t}</Text>
              <Text style={styles.cardDesc}>{desc}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontFamily: theme.typography.font.bold, color: theme.colors.textPrimary },
  hint: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, marginBottom: theme.spacing.md },
  row: { flexDirection: 'row', gap: theme.spacing.sm },
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    minHeight: 150,
  },
  cardActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  cardDesc: { fontSize: 12, lineHeight: 17, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 4 },
});
