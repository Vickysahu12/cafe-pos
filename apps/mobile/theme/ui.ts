// theme/ui.ts
// ADDED (2026-10-08): UI REDESIGN — shared style pieces jo HAR screen same use karti hai.
// USE CASE: pehle har screen ne apna header/back button/card banaya tha (38px grey circle,
// 32px bina-circle arrow, safed header + border…) → app "jod-jaad" lagti thi. Ab ek jagah:
// ise badlo, poori app badle. Values theme (colors/typography/spacing) se aati hain.

import type { TextStyle, ViewStyle } from 'react-native';
import { colors } from './colors';
import { typography } from './typography';
import { radius } from './spacing';

/** Sub-screen ka top bar: warm background (koi safed patti / border nahi) */
const headerBar: ViewStyle = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingTop: 6,
  paddingBottom: 10,
  backgroundColor: colors.background,
};

/** Back / icon button: 40px safed circle + hairline border (44px tap with hitSlop) */
const iconButton: ViewStyle = {
  width: 40,
  height: 40,
  borderRadius: radius.full,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.border,
  justifyContent: 'center',
  alignItems: 'center',
};

const headerTitle: TextStyle = {
  fontSize: 17,
  fontFamily: typography.font.semibold,
  color: colors.textPrimary,
};

/** Standard card: safed, hairline border, soft radius, koi bhaari shadow nahi */
const card: ViewStyle = {
  backgroundColor: colors.surface,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
};

/** Section heading (list ke upar) — sentence case, semibold, uppercase nahi */
const sectionTitle: TextStyle = {
  fontSize: 15,
  fontFamily: typography.font.semibold,
  color: colors.textPrimary,
};

/** Warm, halki shadow (kaali/neeli nahi) — sirf floating cheezon (sheets, FAB) pe */
const softShadow: ViewStyle = {
  shadowColor: '#2B1F14',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 3,
};

export const ui = { headerBar, iconButton, headerTitle, card, sectionTitle, softShadow };
