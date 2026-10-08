// theme/typography.ts
// USE CASE: Type scale — sizes, weights, fonts.
// CONNECTED TO: Used by every screen/component via theme/index.ts
//
// UI REDESIGN (2026-10-08): poori app Geist pe (clean, chhote size pe bhi saaf).
//  - `font.*` = Geist ke weights (app/_layout.tsx mein load). Custom font pe `fontWeight`
//    Android pe kaam nahi karta — isliye har text style `fontFamily: theme.typography.font.X`
//    use karta hai (weight family ke naam mein hai).
//  - Numbers (₹, order #, counts): style mein `fontVariant: ['tabular-nums']` — digits line up.
//  - `fontFamilyBrand` = Vicky ka BillRaw wordmark/splash font (Space Grotesk) — ise mat badalna.

import { font } from './brand';

export const typography = {
  fontFamily: font.regular,

  /** Screen/section headings */
  fontFamilyDisplay: font.bold,

  /** BillRaw wordmark (BrandMark) + animated splash — Vicky ka design, Space Grotesk hi rahega */
  fontFamilyBrand: 'SpaceGrotesk_700Bold',

  /** Weight-wise font families (fontWeight ki jagah yeh use karo) */
  font,

  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  /** @deprecated custom font ke saath kaam nahi karta (Android) — `font.*` use karo */
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};
