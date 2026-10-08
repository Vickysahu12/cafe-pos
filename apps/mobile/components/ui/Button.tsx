// components/ui/Button.tsx
// USE CASE: Primary button used across the whole app — shows a spinner and disables itself
//           while an action is in progress, so users never double-tap into a duplicate order/account.
// CONNECTED TO: Used by every form screen (login, register, checkout, etc.)
//
// UI REDESIGN (2026-10-08): espresso primary (brand), press pe halka scale (0.98, 120ms,
// core Animated native driver — UI thread) — Dashboard cards jaisa hi "physical" feel.
// FIX (2026-10-08): Reanimated hataya — Expo Go mein import pe crash (dekho PressScale.tsx).
// Haptic yahan nahi: button ka kaam (payment, login) apna success/error haptic deta hai —
// ek action pe do haptic nahi (animate-expo rule).

import { useRef } from 'react';
import { Animated, Easing, Pressable, Text, ActivityIndicator, StyleSheet, PressableProps } from 'react-native';
import { useReduceMotion } from './PressScale';
import { theme } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface ButtonProps extends PressableProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, loading, variant = 'primary', disabled, style, onPressIn, onPressOut, ...rest }: ButtonProps) {
  const isDisabled = disabled || loading;
  const reduced = useReduceMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const animateTo = (toValue: number) =>
    Animated.timing(progress, { toValue, duration: 120, easing: Easing.bezier(0.23, 1, 0.32, 1), useNativeDriver: true }).start();
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, reduced ? 1 : 0.98] });
  const pressOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, reduced ? 0.85 : 1] });
  return (
    <AnimatedPressable
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      onPressIn={(e) => {
        if (!isDisabled) animateTo(1);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(0);
        onPressOut?.(e);
      }}
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : styles.secondary,
        isDisabled && styles.disabled,
        style as any,
        { transform: [{ scale }], opacity: isDisabled ? 0.5 : pressOpacity },
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.colors.white : theme.colors.primary} />
      ) : (
        <Text style={variant === 'primary' ? styles.textPrimary : styles.textSecondary}>{title}</Text>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  primary: { backgroundColor: theme.colors.primary },
  secondary: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderStrong },
  disabled: {},
  textPrimary: { color: theme.colors.white, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold },
  textSecondary: { color: theme.colors.textPrimary, fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold },
});
