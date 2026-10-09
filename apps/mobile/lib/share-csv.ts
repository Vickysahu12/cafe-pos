// lib/share-csv.ts
// ADDED (2026-10-09): Reports → "Export" — CSV ko phone pe file bana ke share sheet kholta hai
// (WhatsApp pe CA ko bhejo, Drive mein save karo, Gmail se mail karo). Excel / Google Sheets
// mein seedha khulta hai (backend UTF-8 BOM bhejta hai taaki ₹ aur Hindi naam sahi dikhein).
//
// Kyun cache folder: yeh sirf share ke liye temporary copy hai — OS khud saaf kar deta hai,
// phone ki storage mein purani reports jama nahi hoti. Same naam ki purani file pehle hata dete hain.
// CONNECTED TO: features/analytics/analytics.api.ts (exportCsv), app/(admin)/sales-report.tsx

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function shareCsv(filename: string, csv: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  // Filename mein sirf safe characters (date range wagairah) — path tricks se bachav
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
  const file = new File(Paths.cache, safeName);
  if (file.exists) file.delete();
  file.create();
  file.write(csv.startsWith('﻿') ? csv : `﻿${csv}`);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
    dialogTitle: 'Share report',
  });
}
