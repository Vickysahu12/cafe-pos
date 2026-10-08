// theme/spacing.ts
// USE CASE: Consistent spacing scale — avoids random padding/margin values across screens.
// CONNECTED TO: Used by every screen/component via theme/index.ts

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

// UI REDESIGN (2026-10-08): thode soft corners (6/8/12 → 8/12/16) — billraw.in / order site
// jaisa friendly, premium feel. Har card/button/input apne-aap naya radius leta hai.
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999, // pills, avatars
};