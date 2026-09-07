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
    fontWeight: theme.typography.weight.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  inputWrapperFocused: {
    borderColor: theme.colors.primary,
  },
  inputWrapperError: {
    borderColor: theme.colors.danger,
  },
  leftIcon: { marginRight: theme.spacing.sm },
  input: {
    flex: 1,
    fontSize: theme.typography.size.base,
    color: theme.colors.textPrimary,
    height: '100%',
  },
  errorText: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.danger,
    marginTop: theme.spacing.xs,
    marginLeft: 2,
  },
});