import { Coffee } from "lucide-react";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/25">
        <Coffee size={24} />
      </div>
      <h1 className="text-lg font-bold text-ink">BillRaw</h1>
      <p className="mt-2 max-w-xs text-sm text-muted">
        Scan the QR code on your table to view the menu and place an order.
      </p>
    </main>
  );
}