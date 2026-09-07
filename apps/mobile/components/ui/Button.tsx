// components/ui/Button.tsx
// USE CASE: Primary button used across the whole app — shows a spinner and disables itself
//           while an action is in progress, so users never double-tap into a duplicate order/account.
// CONNECTED TO: Used by every form screen (login, register, checkout, etc.)

import { Pressable, Text, ActivityIndicator, StyleSheet, PressableProps } from 'react-native';
import { theme } from '../../theme';

interface ButtonProps extends PressableProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, loading, variant = 'primary', disabled, style, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style as any,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.white : theme.colors.primary} />
      ) : (
        <Text style={variant === 'primary' ? styles.textPrimary : styles.textSecondary}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  textPrimary: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
  textSecondary: { color: theme.colors.textPrimary, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});