// app/(admin)/legal/terms.tsx
// Reached from Settings → Legal → Terms & Conditions (see settings.tsx).
// Content lives in ./content.ts so it can be updated without touching this file.

import React from 'react';
// app/(admin)/legal/privacy.tsx
import LegalPageLayout from '../../../components/admin/legal/LegalPageLayout';
import { TERMS_SECTIONS } from '../../../components/admin/legal/content';

export default function TermsScreen() {
  return <LegalPageLayout title="Terms & Conditions" sections={TERMS_SECTIONS} />;
}