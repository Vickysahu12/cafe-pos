// app/review/[slug]/page.tsx
// ADDED (2026-10-05): REVIEW BOOSTER — counter pe rakhe printed review card ka QR yahan khulta hai.
// USE CASE: Customer scan kare → "How was your visit?" → ⭐ Rate us on Google (sabko) +
// 💬 Tell the owner privately (optional). Card scan ki ginti owner ke stats mein (CardViewBeacon).
//
// Server component: cafe ka naam + link server pe hi aate hain → 4G pe turant khulta hai.
// QR seedha Google pe nahi, yahan aata hai, taaki (1) cafe Google link badle to printed card
// phir bhi kaam kare, (2) private feedback ka option mile, (3) owner ko scans ki ginti mile.
//
// ⚠️ GOOGLE POLICY: koi rating/filter nahi — dekho components/ReviewPrompt.tsx.

import type { Metadata } from 'next';
import { cache } from 'react';
import { Store } from 'lucide-react';
import { ApiError, publicMenuApi, type PublicReviewInfo } from '@/lib/api';
import { Monogram, PoweredBy, StateScreen } from '@/components/ui';
import { CardViewBeacon, ReviewPrompt } from '@/components/ReviewPrompt';

type Params = { params: Promise<{ slug: string }> };

const loadInfo = cache(async (slug: string): Promise<{ info: PublicReviewInfo | null; notFound: boolean }> => {
  try {
    return { info: await publicMenuApi.getReviewInfo(slug), notFound: false };
  } catch (err) {
    return { info: null, notFound: err instanceof ApiError && err.status === 404 };
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const { info } = await loadInfo(slug);
  return info ? { title: `Review ${info.name}`, description: `How was your visit to ${info.name}?` } : { title: 'Review' };
}

export default async function ReviewPage({ params }: Params) {
  const { slug } = await params;
  const { info, notFound } = await loadInfo(slug);

  if (!info) {
    return notFound ? (
      <StateScreen icon={Store} title="Café not found" message="This review link may be wrong. Please ask the café for help." />
    ) : (
      <StateScreen
        icon={Store}
        tone="danger"
        title="Couldn't load this page"
        message="Please check your internet and try again."
        action={{ label: 'Try again', href: `/review/${slug}` }}
      />
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-paper">
      <CardViewBeacon slug={info.slug} />

      <header
        className="text-white"
        style={{
          background:
            'radial-gradient(90% 80% at 100% 0%, rgb(192 138 46 / 0.30) 0%, rgb(192 138 46 / 0) 60%), var(--color-brand)',
        }}
      >
        <div className="mx-auto max-w-md px-6 pb-16 pt-[max(2rem,env(safe-area-inset-top))]">
          <Monogram name={info.name} className="h-14 w-14 text-xl" />
          <p className="mt-6 text-sm font-medium text-roast-light">{info.name}</p>
          <h1 className="mt-1 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.02em]">How was your visit?</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/70">
            Your review helps a small café grow. It takes less than a minute.
          </p>
        </div>
      </header>

      <div className="relative -mt-7 flex-1 rounded-t-[28px] bg-paper">
        <div className="mx-auto max-w-md px-6 pt-7">
          <ReviewPrompt slug={info.slug} cafeName={info.name} googleReviewUrl={info.googleReviewUrl} source="CARD" variant="page" />
          {!info.googleReviewUrl && (
            <p className="mt-4 text-center text-sm text-muted">Google reviews aren&apos;t set up for this café yet.</p>
          )}
        </div>
      </div>

      <PoweredBy />
    </main>
  );
}
