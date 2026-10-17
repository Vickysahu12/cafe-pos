// app/d/[token]/layout.tsx
// ADDED (2026-10-18): delivery boy ke link ka browser tab title ("Delivery · BillRaw").
// Robots noindex root layout se aata hai — yeh link kabhi Google pe nahi aana chahiye.
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Delivery' };

export default function DeliveryLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
