import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";

// REDESIGN (2026-10-02): DM Sans — billraw.in landing page wala hi font (pehle Manrope).
// Variable font: ek file mein saare weights, next/font self-host karta hai (no Google call).
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

// UI/UX PASS (2026-09-30): title template (browser tab "Menu · BillRaw"), robots noindex —
// har cafe ka menu Google search mein nahi aana chahiye (QR se hi khule), aur mobile
// browser ka top bar brand colour (themeColor).
export const metadata: Metadata = {
  title: { default: "BillRaw — Order", template: "%s · BillRaw" },
  description: "Scan, browse the menu, and order from your table — no app needed.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2B1F14", // REDESIGN (2026-10-02): espresso hero se match
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} font-sans bg-paper text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
