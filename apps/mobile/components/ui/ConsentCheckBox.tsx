// components/ui/ConsentCheckbox.tsx
// USE CASE: Mandatory "notice before consent" checkbox shown before any account/order
//           data is submitted (DPDP Act, 2023 requires itemised notice + explicit
//           consent, not a policy link buried in Settings). Reused on register.tsx and
//           anywhere else data is first collected (e.g. a future QR-order contact form).
// CONNECTED TO: app/legal/privacy.tsx, app/legal/terms.tsx (un-gated, pre-login routes)

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { theme } from '../../theme';

interface ConsentCheckboxProps {
  checked: boolean;
  onToggle: (value: boolean) => void;
  error?: string;
}

export function ConsentCheckbox({ checked, onToggle, error }: ConsentCheckboxProps) {
  const router = useRouter();

  return (
    <View style={styles.wrapper}>
      <Pressable
        style={styles.row}
        onPress={() => onToggle(!checked)}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[styles.box, checked && styles.boxChecked, !!error && styles.boxError]}>
          {checked && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
        </View>

        <Text style={styles.label}>
          I agree to the{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/terms')}>
            Terms & Conditions
          </Text>{' '}
          and have read the{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </Text>
          , including how my name, email, phone and outlet details will be used.
        </Text>
      </Pressable>

      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: theme.spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    backgroundColor: theme.colors.surface,
  },
  boxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  boxError: { borderColor: theme.colors.danger },
  label: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  },
  link: { color: theme.colors.primary, fontWeight: theme.typography.weight.semibold },
  errorText: {
    fontSize: 12,
    color: theme.colors.danger,
    marginTop: 6,
    marginLeft: 30,
  },
});