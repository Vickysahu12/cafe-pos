import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700", "800"],
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
  themeColor: "#134731",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} font-sans bg-paper text-ink antialiased`}>
        {children}
      </body>
    </html>
  );
}
