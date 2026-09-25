// apps/mobile/app/(admin)/legal/content.ts
// Structured content for the Privacy Policy and Terms & Conditions screens.
// Kept as data (not hardcoded JSX) so updates don't require touching the screen files.
// Source of truth / full legal-review versions live in /legal-content/*.md at the repo root.
//
// ⚠️ Replace every [bracketed placeholder] with real values before shipping to production
// or submitting to Play Console. Have a lawyer review before launch.

export const LAST_UPDATED = '[DD Month YYYY]';
export const COMPANY_NAME = '[Your Company / Legal Entity Name]';
export const GRIEVANCE_EMAIL = '[grievance@yourdomain.com]';
export const PRIVACY_EMAIL = '[privacy@yourdomain.com]';
export const SUPPORT_EMAIL = '[support@yourdomain.com]';
export const DELETE_ACCOUNT_URL = 'https://yourdomain.com/delete-account';
export const JURISDICTION = '[City, State]';

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    id: 'intro',
    title: 'Who this policy covers',
    paragraphs: [
      `${COMPANY_NAME} ("we", "us") operates the Staff App (Cashier / Chef / Owner / Manager roles) used by subscribing cafés and outlets, and the Customer Ordering website reached by scanning a table QR code — no account or install needed.`,
      'This policy explains what personal data we collect, why, how we protect it, and your rights over it. It is aligned with the Digital Personal Data Protection Act 2023 (DPDP Act), the IT Rules 2011/2021, and Google Play\u2019s User Data Policy.',
    ],
  },
  {
    id: 'staff-data',
    title: 'Information we collect from staff & Outlets',
    bullets: [
      'Account identity — name, email, phone, role, password (stored as a salted hash, never in plain text)',
      'Outlet information — name, address, phone, GST/registration details, subscription plan',
      'Operational data — orders, order items, prices, table assignments, voids/cancellations, inventory levels',
      'Audit & security logs — logins, voids, discounts, price changes, with who/when/what',
      'Device & diagnostic data — device model, OS version, app version, crash logs, IP address',
      'Bluetooth printer pairing data (Phase 2 feature only)',
    ],
    paragraphs: [
      'We do not collect Aadhaar, PAN, biometric, or health data from staff unless a future feature explicitly requires it — in which case we\u2019ll update this policy and ask for fresh consent first.',
    ],
  },
  {
    id: 'customer-data',
    title: 'Information we collect from customers (QR ordering)',
    bullets: [
      'Order details — items, quantities, special instructions, table/cafe identifier',
      'Optional contact info — name/phone, only if the Outlet enables it to identify your order',
      'Technical data — browser/device type, IP address, order-status polling activity',
    ],
    paragraphs: [
      'We never see or store card numbers, UPI IDs, or bank credentials. Payment in the current version is "Pay at Counter" — settled directly between you and the Outlet. We only record the payment method (Cash/UPI) and amount for the Outlet\u2019s own sales records.',
    ],
  },
  {
    id: 'not-collected',
    title: 'What we don\u2019t collect',
    bullets: [
      'No access to contacts, photos, gallery, microphone, or call logs',
      'No advertising SDKs or third-party trackers',
      'No selling of personal data — ever',
      'No GPS/precise location tracking',
    ],
  },
  {
    id: 'purpose',
    title: 'Why we process this information',
    bullets: [
      'To run the core service — accounts, billing, KDS routing, inventory, analytics',
      'To keep the platform secure — fraud/theft-pattern detection, audit logs, RBAC enforcement',
      'To give Owners business analytics — sales, cash vs UPI split, hourly trends',
      'To communicate service updates and respond to support requests',
      'To comply with law — tax records, lawful requests from courts or police',
      'To improve the product using aggregated, de-identified usage data',
    ],
  },
  {
    id: 'legal-basis',
    title: 'Legal basis for processing (DPDP Act)',
    paragraphs: [
      'Our primary basis is your consent, collected through a clear notice before we process your data. You can withdraw consent any time, though this may mean we can no longer provide the feature that depended on it.',
      'We also rely on the Act\u2019s recognised legitimate-use grounds for security/fraud-prevention logs and legal/tax compliance record-keeping.',
    ],
  },
  {
    id: 'sharing',
    title: 'How we share information',
    bullets: [
      'Database hosting provider (Neon.tech / PostgreSQL) — stores encrypted data',
      'Backend hosting provider — processes requests in transit',
      'Within your own Outlet, restricted by role (RBAC) — e.g. a Cashier can\u2019t see Owner-only analytics',
      'Law enforcement/regulators, only under a valid legal order',
      'A future acquirer in a business sale, with equal or stronger privacy protection and notice to you',
    ],
    paragraphs: [
      'We do not share data with advertisers or data brokers. Our infrastructure may be hosted outside India; the DPDP Act permits this except to countries the Government specifically restricts (none notified as of writing). If this changes, we\u2019ll update this policy first.',
    ],
  },
  {
    id: 'security',
    title: 'How we protect your information',
    bullets: [
      'Encryption in transit — HTTPS/TLS and secure WebSocket (WSS) for live order updates',
      'Encryption at rest in the database',
      'Passwords hashed with bcrypt, never stored in plain text',
      'Short-lived JWT access tokens (15 min) + HttpOnly refresh-token cookie',
      'Role-Based Access Control enforced on every API route, not just hidden in the UI',
      'Automatic audit logging of high-risk actions (voids, discounts, price changes)',
      'Rate limiting on login and order endpoints',
    ],
    paragraphs: [
      'No system is 100% secure. If a breach is likely to affect you, we\u2019ll notify affected Outlets/users and, once that DPDP Act provision is in force, the Data Protection Board of India, without undue delay.',
    ],
  },
  {
    id: 'retention',
    title: 'Data retention',
    bullets: [
      'Active account & operational data — kept while the subscription is active',
      'Audit logs — kept for [1 year], or longer if needed for an active dispute',
      'After account closure — deleted or anonymised within [30\u201390] days, except where tax law requires longer retention of financial records',
      'End-customer order data — kept only to fulfil/display the order, then anonymised into Outlet analytics',
    ],
  },
  {
    id: 'rights',
    title: 'Your rights as a Data Principal',
    bullets: [
      'Access a copy of the personal data we hold about you',
      'Ask us to correct inaccurate or incomplete data',
      'Ask us to erase your data, subject to legal retention needs',
      'Withdraw consent at any time',
      'Raise a grievance with our Grievance Officer, and escalate to the Data Protection Board of India if unresolved',
      'Nominate someone to exercise these rights on your behalf in case of death or incapacity',
    ],
  },
  {
    id: 'deletion',
    title: 'Account & data deletion',
    paragraphs: [
      'In-app: Settings → Account → Delete My Account (Owner accounts), or ask your Owner/Manager to remove your staff profile.',
      `Web, without reinstalling the app: visit ${DELETE_ACCOUNT_URL} and submit a request — we\u2019ll confirm by email within [X] business days.`,
    ],
  },
  {
    id: 'children',
    title: 'Children\u2019s data',
    paragraphs: [
      'Staff accounts are for adults (18+) only. The Customer Ordering page doesn\u2019t verify age, since it just shows a menu like a printed one — we don\u2019t knowingly collect data that identifies a child. If we learn we have, we\u2019ll delete it promptly.',
    ],
  },
  {
    id: 'contact',
    title: 'Grievance Officer & contact',
    paragraphs: [
      `Grievance Officer email: ${GRIEVANCE_EMAIL}`,
      `General privacy questions: ${PRIVACY_EMAIL}`,
      'We aim to acknowledge grievances within 48 hours and resolve them within 30 days, as required by applicable law.',
    ],
  },
  {
    id: 'cookies',
    title: 'Cookies & local storage',
    paragraphs: [
      'Mobile app: we use secure on-device storage (Expo SecureStore) for your session — no third-party ad cookies.',
      'Customer Ordering website: minimal local/session browser storage to remember your cart and order status, cleared automatically and never used to track you across other sites.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    paragraphs: [
      'We\u2019ll post updates here with a new "Last updated" date, and notify Owners in-app or by email in advance of material changes.',
    ],
  },
  {
    id: 'law',
    title: 'Governing law',
    paragraphs: [`This policy is governed by the laws of India. Courts at ${JURISDICTION} have exclusive jurisdiction.`],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of terms',
    paragraphs: [
      'By using the Service — the Staff App or the Customer Ordering website — you agree to these Terms. If you\u2019re accepting on behalf of a café/outlet, you confirm you have authority to bind that business.',
      'Sections 2\u201317 apply in full to Outlets/staff. If you\u2019re an End Customer ordering via QR code, Section 9 applies specifically to you.',
    ],
  },
  {
    id: 'service',
    title: 'What the Service is',
    paragraphs: [
      `${COMPANY_NAME} is a SaaS Point-of-Sale and cafe-management platform: a role-based staff app, real-time Kitchen Display System, inventory tracking, sales analytics, and a QR ordering page.`,
      'We are a technology provider only — not a restaurant, food seller, or payment processor, and not a party to any transaction between an Outlet and its customers.',
    ],
  },
  {
    id: 'accounts',
    title: 'Eligibility & accounts',
    bullets: [
      'You must be 18+ to hold an Owner or staff account',
      'Owners manage staff accounts, roles, and must revoke access promptly when someone leaves',
      'You\u2019re responsible for keeping login credentials confidential and for all activity under your account',
      'You agree to keep Outlet and billing information accurate',
    ],
  },
  {
    id: 'billing',
    title: 'Subscription, billing & payment',
    bullets: [
      'Basic — ₹799 / outlet / month',
      'Standard — ₹899 / outlet / month',
      'Pro — ₹999 / outlet / month',
    ],
    paragraphs: [
      'Billed per outlet, in advance, monthly, auto-renewing unless cancelled before the next billing date. Prices are in INR, [inclusive/exclusive] of GST.',
      'If payment fails, we may suspend the affected Outlet after reasonable notice. Pricing changes require at least 30 days\u2019 notice to existing subscribers.',
    ],
  },
  {
    id: 'cancellation',
    title: 'Cancellation & refunds',
    paragraphs: [
      'Cancel anytime from Settings → Billing; cancellation takes effect at the end of the current billing cycle and you keep access until then.',
      'Fees already paid are non-refundable except where required by law, including for partial billing periods.',
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    bullets: [
      'No selling illegal goods or misrepresenting items sold',
      'No bypassing RBAC or accessing another Outlet\u2019s data',
      'No malware, large-scale scraping, or overloading our infrastructure',
      'No using void/discount features to conceal theft or fraud',
      'No reselling or sublicensing the Service without our written consent',
    ],
  },
  {
    id: 'roles',
    title: 'Roles & responsibilities within an Outlet',
    paragraphs: [
      'The Owner decides staff roles per the app\u2019s permission matrix, and is responsible for menu/price/inventory accuracy and for resolving disputes with their own customers about food or service — we have no role in, or liability for, what the Outlet sells or serves.',
    ],
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    paragraphs: [
      'We own the Service, its software, design, and trademarks, and grant you a limited, non-exclusive, non-transferable licence to use it for your Outlet — a licence, not a sale.',
      'Your business data (menu, pricing, inventory, order history) remains yours. We process it only to provide the Service, and will make it exportable/deletable on request per our Privacy Policy.',
    ],
  },
  {
    id: 'third-party',
    title: 'Third-party services',
    paragraphs: [
      'The Service relies on third-party infrastructure (database and server hosting, and in future, Bluetooth printing and/or payment gateways). Any such integration may carry its own terms, linked when introduced.',
    ],
  },
  {
    id: 'end-customers',
    title: 'Terms specific to End Customers (QR ordering)',
    bullets: [
      'You order directly with the Outlet — we only provide the ordering technology',
      '"Pay at Counter" happens directly between you and the Outlet; we never see your payment credentials',
      'Order accuracy, food quality, allergens, pricing, and refunds are the Outlet\u2019s responsibility',
      'No account is required; any name/phone you give is used only to help identify your order',
    ],
  },
  {
    id: 'availability',
    title: 'Service availability',
    paragraphs: [
      'We aim for reliable uptime but don\u2019t guarantee uninterrupted, error-free operation, especially during the MVP/beta phase. We recommend Outlets keep a manual backup (e.g. a paper order pad) during the initial launch period.',
    ],
  },
  {
    id: 'liability',
    title: 'Disclaimers & limitation of liability',
    paragraphs: [
      'The Service is provided "as is" without warranties of any kind, to the maximum extent the law allows.',
      'Our total liability for any claim is capped at the fees the affected Outlet paid in the preceding [3\u20136] months, and we\u2019re not liable for indirect or consequential damages, except where the law doesn\u2019t allow such limits (e.g. fraud or gross negligence).',
    ],
  },
  {
    id: 'indemnity',
    title: 'Indemnification',
    paragraphs: [
      'You agree to indemnify us against claims arising from your breach of these Terms, misuse of the Service, or a dispute between your Outlet and its own customer or staff member.',
    ],
  },
  {
    id: 'termination',
    title: 'Termination',
    paragraphs: [
      'You can cancel anytime. We may suspend or terminate access for breach, non-payment, legal requirement, or if we can no longer commercially provide the Service — with reasonable notice and a way to export your data where possible.',
    ],
  },
  {
    id: 'changes-terms',
    title: 'Changes to these terms',
    paragraphs: [
      'We\u2019ll notify Owners of material changes in-app or by email at least 15 days before they take effect. Continued use after that date means you accept the update.',
    ],
  },
  {
    id: 'law-terms',
    title: 'Governing law & disputes',
    paragraphs: [`Governed by the laws of India; courts at ${JURISDICTION} have exclusive jurisdiction, subject to either party\u2019s right to seek injunctive relief where needed.`],
  },
  {
    id: 'force-majeure',
    title: 'Force majeure',
    paragraphs: [
      'Neither party is liable for delay or failure caused by events beyond reasonable control — natural disasters, internet/power/cloud outages, government action, and similar events.',
    ],
  },
  {
    id: 'contact-terms',
    title: 'Contact',
    paragraphs: [`Questions about these Terms: ${SUPPORT_EMAIL}`],
  },
];