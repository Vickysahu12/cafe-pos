// app/review/[slug]/card/page.tsx
// ADDED (2026-10-05): REVIEW BOOSTER — PRINTABLE REVIEW CARD (A6 postcard).
// USE CASE: Owner app → Reviews → "Print review card" yahan laata hai. Browser ka
// "Save as PDF / Print" → print shop pe laminate karwao → counter pe rakho.
// QR → /review/<slug> (Google seedha nahi — kyun, dekho ../page.tsx).
//
// - QR server pe hi SVG banta hai (`qrcode` library) → print mein ekdum sharp, koi JS nahi
// - @page A6 + print-color-adjust: exact → espresso band print mein bhi aata hai
// - Card pe "Rate us on Google" — koi "5 star do" wala dabav nahi (Google policy)

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { Star, Store } from 'lucide-react';
import { ApiError, publicMenuApi } from '@/lib/api';
import { Monogram, StateScreen } from '@/components/ui';
import { PrintButton } from '@/components/PrintButton';

type Params = { params: Promise<{ slug: string }> };

export const metadata: Metadata = { title: 'Review card' };

export default async function ReviewCardPage({ params }: Params) {
  const { slug } = await params;

  let info;
  try {
    info = await publicMenuApi.getReviewInfo(slug);
  } catch (err) {
    const notFound = err instanceof ApiError && err.status === 404;
    return (
      <StateScreen
        icon={Store}
        tone={notFound ? 'brand' : 'danger'}
        title={notFound ? 'Café not found' : "Couldn't load the card"}
        message={notFound ? 'Please check the link.' : 'Please try again in a moment.'}
        action={notFound ? undefined : { label: 'Try again', href: `/review/${slug}/card` }}
      />
    );
  }

  // Jis domain pe yeh page khula wahi QR mein (prod: order.billraw.in, local: localhost)
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'order.billraw.in';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const reviewUrl = `${proto}://${host}/review/${info.slug}`;
  const qrSvg = await QRCode.toString(reviewUrl, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#1A140E', light: '#FFFFFF' },
  });

  return (
    <main className="min-h-dvh bg-paper px-4 py-8 print:bg-white print:p-0">
      {/* Print: poora A6 page = card, koi margin nahi; background colours print hon */}
      <style>{`
        @page { size: A6 portrait; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          .review-card { width: 105mm !important; height: 148mm !important; border-radius: 0 !important; box-shadow: none !important; border: 0 !important; margin: 0 !important; }
        }
        .review-card, .review-card * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      `}</style>

      <div className="mx-auto mb-5 max-w-sm text-center print:hidden">
        <h1 className="text-xl font-bold tracking-tight text-ink">Your review card</h1>
        <p className="mt-1 text-sm text-muted">Print it, laminate it and keep it at your billing counter.</p>
      </div>

      {/* ── The card (A6 = 105 × 148 mm) ── */}
      <article className="review-card mx-auto flex aspect-[105/148] w-full max-w-[340px] flex-col overflow-hidden rounded-[24px] border border-line bg-surface shadow-[0_24px_48px_-24px_rgb(43_31_20/0.4)]">
        <div
          className="flex items-center gap-3 px-[7%] py-[6%] text-white"
          style={{
            background:
              'radial-gradient(90% 90% at 100% 0%, rgb(192 138 46 / 0.35) 0%, rgb(192 138 46 / 0) 60%), #2B1F14',
          }}
        >
          <Monogram name={info.name} className="h-11 w-11 text-base" />
          <p className="min-w-0 text-[17px] font-bold leading-tight">{info.name}</p>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-[8%] text-center">
          <p className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-ink">Enjoyed your visit?</p>
          <div className="mt-2 flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={18} className="fill-roast text-roast" />
            ))}
          </div>

          <div className="mt-[6%] rounded-2xl border-2 border-roast/60 bg-white p-3">
            {/* qrcode library ka SVG — input sirf humara apna URL hai */}
            <div className="h-[132px] w-[132px] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qrSvg }} />
          </div>

          <p className="mt-[6%] text-[15px] font-bold text-ink">Scan to rate us on Google</p>
          <p className="mt-1 text-xs text-muted">Takes less than a minute · Thank you!</p>
        </div>

        <p className="border-t border-line py-[3.5%] text-center text-[10px] text-muted">Powered by BillRaw · billraw.in</p>
      </article>

      <div className="mx-auto mt-6 flex max-w-[340px] flex-col gap-3 print:hidden">
        {/* flex wrapper: column layout mein PrintButton ka flex-1 height collapse kar deta tha */}
        <div className="flex">
          <PrintButton label="Print / Save as PDF" />
        </div>
        <ul className="space-y-1.5 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          <li>
            <strong className="text-ink">Size:</strong> A6 (postcard). Any print shop can print and laminate it.
          </li>
          <li>
            <strong className="text-ink">Where:</strong> next to your billing counter, where customers pay.
          </li>
          <li>
            <strong className="text-ink">Test it:</strong> scan the QR with your phone before printing many.
          </li>
        </ul>
      </div>
    </main>
  );
}
