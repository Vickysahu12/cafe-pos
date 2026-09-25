// app/(admin)/legal/privacy.tsx
import LegalPageLayout from '../../../components/admin/legal/LegalPageLayout';
import { PRIVACY_SECTIONS } from '../../../components/admin/legal/content';

export default function PrivacyPolicyScreen() {
  return <LegalPageLayout title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}