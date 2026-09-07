// theme/typography.ts
// USE CASE: Type scale — sizes, weights, and brand display font.
// CONNECTED TO: Used by every screen/component via theme/index.ts

export const typography = {
  fontFamily: 'System', // body text — keeps native feel, fast

  fontFamilyDisplay: 'SpaceGrotesk_700Bold', // brand wordmark, splash, headings

  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
};