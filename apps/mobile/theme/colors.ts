// theme/colors.ts
// USE CASE: Central color palette — used by every screen/component via theme/index.ts.
//
// UI REDESIGN (2026-10-08): generic blue (#2563EB, Tailwind default — har template jaisa)
// se BillRaw brand pe: ESPRESSO + ROAST GOLD, warm paper background — billraw.in,
// order.billraw.in, review card aur app icon jaisa. Key names wahi rakhe (primary,
// primaryLight…) taaki ~940 jagah jo `theme.colors.*` use karti hain, apne-aap naye
// rang le lein. Values theme/brand.ts se aati hain (ek hi source).
//
// Status colours SEMANTIC hi hain (paid/ready = green, preparing = amber, late/cancel = red) —
// staff inhe ek nazar mein padhte hain, brand ke liye kabhi mat badalna.
// Contrast (WCAG AA): textPrimary/background 16:1, textSecondary/background 5.2:1,
// primary(espresso)/white 15.6:1. textMuted sirf meta/icons/placeholder ke liye.

import { brand } from './brand';

export const colors = {
  // Base (backgrounds, surfaces)
  background: brand.paper,
  surface: brand.card,
  border: brand.line,
  borderStrong: brand.lineStrong,

  // Text
  textPrimary: brand.ink,
  textSecondary: brand.muted,
  textMuted: brand.faint,

  // Brand — espresso (primary actions, active states) + roast gold (accent)
  primary: brand.espresso,
  primaryDark: '#1A120B',      // pressed / emphasis
  primaryLight: brand.wash,    // selected rows, icon tiles, soft highlights
  accent: brand.roast,         // graphics / large only (3:1 on white)
  accentInk: brand.roastInk,   // accent-coloured small text / links
  accentLight: brand.roastLight, // accent on espresso surfaces

  // Status (semantic)
  success: brand.success,      // Ready, Paid, Delivered
  successLight: brand.successWash,
  warning: brand.warning,      // Preparing, Pending, ~8min KDS warning
  warningLight: brand.warningWash,
  danger: brand.danger,        // Cancelled, low-stock, ~15min KDS overdue
  dangerLight: brand.dangerWash,

  white: '#FFFFFF',
  black: '#000000',
  disabled: '#D6CFC4',
};
