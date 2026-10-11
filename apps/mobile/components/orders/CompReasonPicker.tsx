// components/orders/CompReasonPicker.tsx
// ADDED (2026-10-11): COMPLIMENTARY — "kyun free diya?" ek tap mein. Cart (bill banate waqt) aur
// order detail (baad mein free karna) dono yahi use karte hain — same chips, same wording.
// "Other" → khud likho (2–120 chars, backend bhi check karta hai). Reason owner ke Reports +
// Audit logs mein dikhta hai (misuse pakadne ke liye) — customer ko kabhi nahi.

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput } from 'react-native';
import { haptics } from '../../lib/haptics';
import { theme } from '../../theme';

export const COMP_REASONS = ['Guest of owner', 'Regular customer', 'Staff meal', 'Apology', 'Promotion'];

export function CompReasonPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const isPreset = COMP_REASONS.includes(value);
  const [other, setOther] = useState(!isPreset && value !== '');

  return (
    <View>
      <View style={styles.row} accessibilityRole="radiogroup">
        {COMP_REASONS.map((r) => {
          const active = value === r && !other;
          return (
            <Pressable
              key={r}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { haptics.tap(); setOther(false); onChange(active ? '' : r); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{r}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.chip, other && styles.chipActive]}
          onPress={() => { haptics.tap(); setOther(true); if (isPreset) onChange(''); }}
          accessibilityRole="radio"
          accessibilityState={{ checked: other }}
        >
          <Text style={[styles.chipText, other && styles.chipTextActive]}>Other</Text>
        </Pressable>
      </View>
      {other && (
        <TextInput
          style={styles.input}
          value={isPreset ? '' : value}
          onChangeText={(t) => onChange(t.slice(0, 120))}
          placeholder="Write the reason"
          placeholderTextColor={theme.colors.textMuted}
          selectionColor={theme.colors.accent}
          cursorColor={theme.colors.accent}
          maxLength={120}
          autoFocus
          accessibilityLabel="Reason for complimentary"
        />
      )}
    </View>
  );
}

/** Reason chalega? (backend: 2–120 chars) */
export function isValidCompReason(v: string): boolean {
  const t = v.trim();
  return t.length >= 2 && t.length <= 120;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: theme.radius.full, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, justifyContent: 'center' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontFamily: theme.typography.font.semibold, color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.white },
  input: {
    marginTop: theme.spacing.sm, height: 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.md,
    paddingHorizontal: 12, fontSize: 15, fontFamily: theme.typography.font.regular, color: theme.colors.textPrimary, backgroundColor: theme.colors.surface,
  },
});
