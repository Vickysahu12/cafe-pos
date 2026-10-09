// features/orders/qr-alert-prefs.ts
// ADDED (2026-10-09): "Sound for new QR orders" ka on/off — SIRF IS PHONE ke liye.
// Kyun per-phone: owner ka personal phone raat ko ghar pe na baje, par counter wala phone
// bajta rahe. Isliye server pe nahi, device pe (SecureStore) save hota hai.
//  - Default ON (naya install / pehli baar) — counter pe QR order miss na ho
//  - Logout pe saaf NAHI hota (device ki setting hai, user ki nahi)
//  - Sound OFF ho tab bhi banner + halki vibration aati hai (order kabhi chupchaap nahi aata)
//  - Cashier ke paas Settings screen nahi hai → counter phone pe hamesha ON (jaan-boojh ke)
// CONNECTED TO: components/orders/QrOrderAlert.tsx (padhta hai), app/(admin)/settings.tsx (toggle).

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const KEY = 'billraw_qr_alert_sound';

interface QrAlertPrefs {
  soundOn: boolean;
  loaded: boolean;
  touched: boolean; // user ne load se pehle hi toggle kiya → purani saved value overwrite na kare
  load: () => Promise<void>;
  setSoundOn: (on: boolean) => Promise<void>;
}

export const useQrAlertPrefs = create<QrAlertPrefs>((set, get) => ({
  soundOn: true,
  loaded: false,
  touched: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (get().touched) set({ loaded: true });
      else set({ soundOn: raw !== 'off', loaded: true });
    } catch {
      set({ loaded: true }); // padh nahi paaye → default ON hi sahi (miss hone se behtar)
    }
  },
  setSoundOn: async (on) => {
    set({ soundOn: on, touched: true }); // UI turant badle
    try {
      await SecureStore.setItemAsync(KEY, on ? 'on' : 'off');
    } catch {
      // save fail → is session mein to kaam karega; agli baar default ON (safe side)
    }
  },
}));
