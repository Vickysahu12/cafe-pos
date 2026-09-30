// app/page.tsx
// USE CASE: order.billraw.in ka root — koi seedha domain khole (bina cafe QR ke) to
// use samjhao ki menu cafe ke QR se khulta hai.
//
// UI/UX PASS (2026-09-30): pehle yahan hardcoded "Table 12" aur ek dikhta hua
// "Illustration Placeholder — Image will fit here" box tha (adhoora page public pe).
// Ab saaf, branded, ek-screen explainer + cafe owners ke liye billraw.in link.

import { QrCode, UtensilsCrossed, Clock3 } from 'lucide-react';

const STEPS = [
  { Icon: QrCode, title: 'Scan the QR', text: 'on your table or at the counter' },
  { Icon: UtensilsCrossed, title: 'Pick your food', text: 'from the live menu' },
  { Icon: Clock3, title: 'Track your order', text: 'and pay at the counter' },
];

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <p className="text-sm font-bold uppercase tracking-widest text-brand">BillRaw</p>
        <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink">
          Order from your table. No app needed.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Menus open when you scan the QR code at a café that uses BillRaw.
        </p>

        <ol className="mt-8 space-y-3">
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Icon size={22} aria-hidden="true" />
              </span>
              <div>
                <p className="text-[15px] font-bold text-ink">
                  <span className="mr-1.5 text-muted">{i + 1}.</span>
                  {title}
                </p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <footer className="border-t border-line px-6 py-5 text-center text-sm text-muted">
        Run a café?{' '}
        <a href="https://billraw.in" className="font-bold text-brand underline-offset-2 hover:underline">
          See BillRaw for your business
        </a>
      </footer>
    </main>
  );
}
