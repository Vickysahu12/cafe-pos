// lib/haptics.ts
// USE CASE (2026-09-30): Halki vibration feedback — item add, payment success,
// error. Rush ke waqt cashier screen dekhe bina bhi mehsoos karta hai ki tap
// register hua (double-tap / double-order kam hote hain). Premium POS apps ka standard.
// Kabhi crash nahi karta — device support na kare to chupchaap ignore.
// CONNECTED TO: billing.tsx (add item), checkout / order detail (payment), errors.

import * as Haptics from 'expo-haptics';

const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {});
};

export const haptics = {
  /** Chhota tap — item add, stepper +/- */
  tap: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Kaam ho gaya — order placed, payment collected */
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Kuch galat — validation/API error */
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
