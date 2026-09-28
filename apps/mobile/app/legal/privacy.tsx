// app/(admin)/legal/privacy.tsx
import LegalPageLayout from '../../components/LegalPageLayout';
import { PRIVACY_SECTIONS } from '../../components/content';

export default function PrivacyPolicyScreen() {
  return <LegalPageLayout title="Privacy Policy" sections={PRIVACY_SECTIONS} />;
}