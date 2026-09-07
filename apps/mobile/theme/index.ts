// theme/index.ts
// USE CASE: Single import point for the whole theme.
// CONNECTED TO: Every screen/component imports from here: `import { theme } from '@/theme'`

import { colors } from './colors';
import { typography } from './typography';
import { spacing, radius } from './spacing';

export const theme = {
  colors,
  typography,
  spacing,
  radius,
};

export { colors, typography, spacing, radius };