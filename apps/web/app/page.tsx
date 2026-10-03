// app/page.tsx
// USE CASE: order.billraw.in ka root — koi seedha domain khole (bina cafe QR ke) to
// use samjhao ki menu cafe ke QR se khulta hai.
//
// UI/UX PASS (2026-09-30): pehle yahan hardcoded "Table 12" aur ek dikhta hua
// "Illustration Placeholder — Image will fit here" box tha (adhoora page public pe).
//
// REDESIGN (2026-10-02): landing jaisa espresso hero + BillRaw wordmark (uppercase
// "eyebrow" label hataya), 3 steps ek saaf timeline mein, cafe owners ke liye billraw.in link.

import { ArrowUpRight, Clock3, QrCode, UtensilsCrossed } from 'lucide-react';

const STEPS = [
  { Icon: QrCode, title: 'Scan the QR', text: 'On your table or at the counter' },
  { Icon: UtensilsCrossed, title: 'Pick your food', text: 'From the live menu, no app needed' },
  { Icon: Clock3, title: 'Track your order', text: 'Then pay at the counter' },
];

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <section
        className="text-white"
        style={{
          background:
            'radial-gradient(90% 80% at 100% 0%, rgb(192 138 46 / 0.30) 0%, rgb(192 138 46 / 0) 60%), var(--color-brand)',
        }}
      >
        <div className="mx-auto max-w-md px-6 pb-16 pt-10">
          <p className="text-lg font-bold tracking-tight">
            Bill<span className="text-roast-light">Raw</span>
          </p>
          <h1 className="mt-10 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.02em]">
            Order from your table. No app needed.
          </h1>
          <p className="mt-3 text-base leading-relaxed text-white/70">
            Menus open when you scan the QR code at a café that uses BillRaw.
          </p>
        </div>
      </section>

      <div className="relative -mt-7 flex-1 rounded-t-[28px] bg-paper">
        <ol className="mx-auto max-w-md px-6 pt-8">
          {STEPS.map(({ Icon, title, text }, i) => (
            <li key={title} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-roast-ink">
                  <Icon size={21} aria-hidden="true" />
                </span>
                {i < STEPS.length - 1 && <span className="my-1.5 w-0.5 flex-1 rounded-full bg-line" />}
              </div>
              <div className={i < STEPS.length - 1 ? 'pb-7' : ''}>
                <p className="pt-2.5 text-[15px] font-bold text-ink">{title}</p>
                <p className="text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <footer className="border-t border-line px-6 py-5 text-center text-sm text-muted">
        Run a café?{' '}
        <a
          href="https://billraw.in"
          className="inline-flex items-center gap-0.5 font-bold text-ink underline-offset-2 hover:underline"
        >
          See BillRaw for your business <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}
