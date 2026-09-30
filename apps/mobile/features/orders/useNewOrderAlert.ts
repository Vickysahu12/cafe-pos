// features/orders/useNewOrderAlert.ts
// USE CASE (2026-09-30): Naya order aane pe KITCHEN CHIME + vibration. Rush mein chef
// tablet ko ghoor nahi raha hota — bina awaaz ke naye orders miss ho jaate the.
// Har professional KDS (Petpooja bhi) beep karta hai.
//   - Sound: assets/sounds/new-order.wav (khud generate kiya 2-tone chime, koi licence issue nahi)
//   - iPhone/iPad silent switch ON ho tab bhi bajta hai (kitchen alert zaroori hai)
//   - Ek saath 5 orders aayein to 5 baar nahi — 1.5 sec mein ek hi baar bajta hai
// CONNECTED TO: app/(chef)/kds.tsx (order:created socket event), lib/haptics.ts.

import { useCallback, useEffect, useRef } from 'react';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { haptics } from '../../lib/haptics';

const CHIME = require('../../assets/sounds/new-order.wav');
const MIN_GAP_MS = 1500;

export function useNewOrderAlert() {
  const player = useAudioPlayer(CHIME);
  const lastPlayedAt = useRef(0);

  useEffect(() => {
    // Silent mode mein bhi bajo; doosre apps ka music bas thoda dheema ho (duck)
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
  }, []);

  return useCallback(() => {
    const now = Date.now();
    if (now - lastPlayedAt.current < MIN_GAP_MS) return;
    lastPlayedAt.current = now;
    haptics.success();
    try {
      // Pichla chime khatam na hua ho to bhi shuru se bajao
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // Audio fail ho (e.g. device muted policy) to bhi app crash nahi hona chahiye
    }
  }, [player]);
}
