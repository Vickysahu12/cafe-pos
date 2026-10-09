// lib/use-flow-base.ts
// ADDED (2026-10-09): Billing flow (billing → cart → checkout → confirmation → order detail)
// ab DO jagah chalta hai: Cashier app ((cashier) group) aur Owner/Manager app ka "Bill" tab
// ((admin) group). Screens same hain (admin wale bas re-export karte hain), isliye har
// navigation ko pata hona chahiye ki woh kis group mein hai — warna Owner "Cart" dabate hi
// cashier ke tab bar (Billing/Orders) mein phas jaata, Home tab gayab.
// USE: const base = useFlowBase(); router.push(`${base}/cart`)

import { useSegments } from 'expo-router';

export type FlowBase = '/(admin)' | '/(cashier)';

export function useFlowBase(): FlowBase {
  const segments = useSegments();
  return segments[0] === '(admin)' ? '/(admin)' : '/(cashier)';
}
