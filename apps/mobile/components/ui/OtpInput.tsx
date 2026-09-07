// components/ui/OtpInput.tsx
// USE CASE: 6-box OTP input with auto-advance to next box and backspace-to-previous —
//           matches the pattern used by top consumer/fintech apps instead of a raw text field.
// CONNECTED TO: app/(auth)/verify-otp.tsx

import { useRef } from 'react';
import { View, TextInput, StyleSheet, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { theme } from '../../theme';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
}

export function OtpInput({ length = 6, value, onChange, error }: OtpInputProps) {
  const inputs = useRef<Array<TextInput | null>>([]);
  const digits = value.split('');

  const handleChange = (text: string, index: number) => {
    const clean = text.replace(/[^0-9]/g, '');

    if (!clean) {
      const next = value.slice(0, index) + value.slice(index + 1);
      onChange(next);
      return;
    }

    const newValue = (value.slice(0, index) + clean.slice(-1) + value.slice(index + 1)).slice(0, length);
    onChange(newValue);

    if (index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.row}>
      {Array.from({ length }).map((_, i) => (
        <TextInput
          key={i}
          ref={(ref) => {
            inputs.current[i] = ref;
          }}
          style={[styles.box, digits[i] ? styles.boxFilled : null, error ? styles.boxError : null]}
          keyboardType="number-pad"
          maxLength={1}
          value={digits[i] || ''}
          onChangeText={(t) => handleChange(t, i)}
          onKeyPress={(e) => handleKeyPress(e, i)}
          textAlign="center"
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: theme.spacing.xl },
  box: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    fontSize: 22,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.background,
  },
  boxFilled: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
  boxError: { borderColor: theme.colors.danger },
});