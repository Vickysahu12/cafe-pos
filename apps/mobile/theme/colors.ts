// theme/colors.ts
// USE CASE: Central color palette — neutral, professional, functional.
// CONNECTED TO: Used by every screen/component via theme/index.ts

export const colors = {
  // Base (backgrounds, surfaces)
  background: '#F7F8FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',

  // Text
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',

  // Accent (single brand color — used sparingly: buttons, active states, links)
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primaryLight: '#DBEAFE',

  // Status colors (functional — match KDS/order-status meaning, not decoration)
  success: '#16A34A',      // Ready, Paid, Delivered
  successLight: '#DCFCE7',
  warning: '#D97706',      // Preparing, Pending, ~8min KDS warning
  warningLight: '#FEF3C7',
  danger: '#DC2626',       // Cancelled, low-stock, ~15min KDS overdue
  dangerLight: '#FEE2E2',

  // Utility
  white: '#FFFFFF',
  black: '#000000',
  disabled: '#D1D5DB',
};