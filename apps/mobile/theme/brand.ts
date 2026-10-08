// theme/brand.ts
// ADDED (2026-10-08): UI TRIAL ("ui-espresso-trial" branch) — BillRaw brand tokens.
// USE CASE: billraw.in / order.billraw.in / review card / app icon jaisa hi look —
// Espresso (deep coffee brown) + Roast Gold, warm paper background, Geist font.
// ABHI SIRF DASHBOARD isse use karta hai. Vicky ko pasand aaye to poori app ka theme
// (theme/colors.ts + typography.ts) isi pe shift karenge; na aaye to yeh file + branch delete.
//
// Rules:
//  - Status colours (paid/ready = green, preparing = amber, late/cancel = red) semantic hi rehte hain
//  - Custom font pe `fontWeight` mat lagao (Android pe weight nahi milta) — `font.semibold`
//    jaisa fontFamily use karo. Numbers (₹, order #, counts) → `font.mono*` (digits line up).
//  - Contrast (WCAG AA): ink/paper 16:1, muted/paper 5.2:1, faint sirf decorative/large text.

export const brand = {
  // Surfaces
  paper: '#F7F5F1',       // screen background (warm, menu-card feel)
  card: '#FFFFFF',
  line: '#EAE5DC',        // borders / dividers
  lineStrong: '#DAD3C6',

  // Text
  ink: '#1A140E',
  muted: '#6B655C',
  faint: '#9A938A',       // sirf secondary meta / icons

  // Brand
  espresso: '#2B1F14',    // primary: hero card, main buttons, avatar
  espressoSoft: '#3D2D1E',
  roast: '#C08A2E',       // accent (graphics / large only)
  roastInk: '#8B6320',    // accent small text
  roastLight: '#E9C98F',  // accent on espresso
  wash: '#F7EFE1',        // icon tiles, soft highlights

  // Semantic (status) — kabhi brand colour se replace nahi
  success: '#15803D',
  successWash: '#E8F5EC',
  warning: '#B45309',
  warningWash: '#FDF3E1',
  danger: '#B91C1C',
  dangerWash: '#FDECEC',

  white: '#FFFFFF',
} as const;

/**
 * KITCHEN (KDS) DARK — ADDED (2026-10-08).
 * Kyun: kitchen garam aur roshni bhari hoti hai, KDS din bhar khula rehta hai — safed screen
 * aankhon pe bhaari aur battery khaati hai. Dark espresso surfaces + garam off-white text.
 * Urgency colours dark pe bright variants (padhne mein aasaan, 2 metre se).
 * Contrast: text/bg 15:1, muted/bg 7.4:1, faint/bg 4.6:1.
 */
export const kds = {
  bg: '#16100A',
  surface: '#221911',
  surfaceRaised: '#2D2218',
  line: '#3A2E22',
  text: '#F6F0E7',
  muted: '#BFB3A3',
  faint: '#8F8475',
  accent: '#E9C98F',      // roast light — quantities, highlights
  green: '#4ADE80',
  greenBg: 'rgba(74,222,128,0.14)',
  amber: '#FBBF24',
  amberBg: 'rgba(251,191,36,0.14)',
  red: '#F87171',
  redBg: 'rgba(248,113,113,0.16)',
} as const;

/** fontFamily names — app/_layout.tsx mein load hote hain */
export const font = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  mono: 'GeistMono_500Medium',
  monoBold: 'GeistMono_700Bold',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 24, full: 999 } as const;

/** Soft, warm shadow (koi neela/kaala glow nahi) */
export const shadow = {
  card: {
    shadowColor: '#2B1F14',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  hero: {
    shadowColor: '#2B1F14',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 8,
  },
} as const;
