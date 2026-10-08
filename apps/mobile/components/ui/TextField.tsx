// components/ui/TextField.tsx
// USE CASE: Standard text input — icon, focus highlight, password show/hide toggle, inline error.
// CONNECTED TO: Used by every form screen (login, register, checkout, etc.)

import { useState } from 'react';
import { View, Text, TextInput, TextInputProps, StyleSheet, Pressable } from 'react-native';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react-native';
import { theme } from '../../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: LucideIcon;
  isPassword?: boolean;
}

export function TextField({
  label,
  error,
  icon: Icon,
  isPassword,
  style,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!isPassword);

  const iconColor = error
    ? theme.colors.danger
    : focused
      ? theme.colors.primary
      : theme.colors.textMuted;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.inputWrapper,
          focused && styles.inputWrapperFocused,
          !!error && styles.inputWrapperError,
        ]}
      >
        {Icon && <Icon size={18} color={iconColor} style={styles.leftIcon} />}
        <TextInput
          style={[styles.input, style as any]}
          placeholderTextColor={theme.colors.textMuted}
          // UI REDESIGN (2026-10-08): cursor + selection bhi brand rang (chhoti detail, finished feel)
          selectionColor={theme.colors.accent}
          cursorColor={theme.colors.accent}
          secureTextEntry={isPassword ? hidden : rest.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {isPassword && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10}>
            {hidden ? (
              <EyeOff size={18} color={theme.colors.textMuted} />
            ) : (
              <Eye size={18} color={theme.colors.textMuted} />
            )}
          </Pressable>
        )}
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: theme.spacing.lg },
  label: {
    fontSize: theme.typography.size.sm,
    fontFamily: theme.typography.font.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1, // UI REDESIGN (2026-10-08): 1.5 → 1 (halka, clean); focus pe roast gold
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  inputWrapperFocused: {
    borderColor: theme.colors.accent, // UI REDESIGN (2026-10-08): order site jaisa roast focus
    borderWidth: 1.5,
  },
  inputWrapperError: {
    borderColor: theme.colors.danger,
  },
  leftIcon: { marginRight: theme.spacing.sm },
  input: {
    flex: 1,
    fontSize: theme.typography.size.base, fontFamily: theme.typography.font.regular,
    color: theme.colors.textPrimary,
    height: '100%',
  },
  errorText: {
    fontSize: theme.typography.size.xs, fontFamily: theme.typography.font.regular,
    color: theme.colors.danger,
    marginTop: theme.spacing.xs,
    marginLeft: 2,
  },
});