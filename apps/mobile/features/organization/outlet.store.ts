// features/organization/outlet.store.ts
// ADDED (2026-10-17)
// USE CASE: Outlet ki do cheezein jo kai screens ko chahiye — SOLO/TEAM mode (More, Setup, Settings,
// Dashboard) aur online orders On/Paused (Dashboard + Orders tab, Owner aur Cashier dono). Ek jagah
// rakhne se ek screen pe badlo to baaki turant same dikhte hain (aur socket `outlet:ordering` se
// doosre phones bhi).
// CONNECTED TO: organization.api.ts, components/orders/OnlineOrdersSwitch.tsx,
//               components/onboarding/WorkModePicker.tsx, auth.store.ts (logout pe reset)

import { create } from 'zustand';
import { organizationApi, OnlineOrdering, OutletDetails, WorkMode } from './organization.api';

/** ADDED (2026-10-18): UPI QR ke liye — verified false = QR mat dikhao */
export interface UpiInfo {
  id: string;
  name: string;
  verified: boolean;
}
const toUpi = (o: OutletDetails): UpiInfo | null =>
  o.upiId ? { id: o.upiId, name: o.upiName ?? '', verified: !!o.upiVerifiedAt } : null;

interface OutletState {
  /** undefined = abhi load nahi hua, null = Owner ne chuna nahi */
  workMode: WorkMode | null | undefined;
  ordering: OnlineOrdering | null;
  upi: UpiInfo | null; // ADDED (2026-10-18)
  loaded: boolean;
  load: () => Promise<void>;
  setWorkMode: (mode: WorkMode) => Promise<void>;
  setOrdering: (ordering: OnlineOrdering) => void;
  /** ADDED (2026-10-18): UPI settings screen save/verify ke baad */
  applyOutlet: (outlet: OutletDetails) => void;
  reset: () => void;
}

export const useOutletStore = create<OutletState>((set) => ({
  workMode: undefined,
  ordering: null,
  upi: null,
  loaded: false,

  load: async () => {
    const outlet = await organizationApi.getOutlet();
    set({
      workMode: outlet.workMode ?? null,
      ordering: outlet.ordering ?? { open: true, pausedUntil: null },
      upi: toUpi(outlet), // ADDED (2026-10-18)
      loaded: true,
    });
  },

  // Error (409 STAFF_EXISTS) caller tak jaata hai — screen message dikhati hai
  setWorkMode: async (mode) => {
    const outlet = await organizationApi.setWorkMode(mode);
    set({ workMode: outlet.workMode ?? mode });
  },

  setOrdering: (ordering) => set({ ordering }),

  applyOutlet: (outlet) => set({ upi: toUpi(outlet), workMode: outlet.workMode ?? null }),

  reset: () => set({ workMode: undefined, ordering: null, upi: null, loaded: false }),
}));

/** SOLO hai? (null/undefined = purana poora TEAM flow dikhao — kuch chhupao mat) */
export const useIsSolo = () => useOutletStore((s) => s.workMode === 'SOLO');
