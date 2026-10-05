'use client';

// components/ReviewPrompt.tsx
// ADDED (2026-10-05): REVIEW BOOSTER — "⭐ Rate us on Google" + "💬 Tell the owner privately".
// USE CASE: ek hi component 3 jagah:
//   - /review/[slug]        (counter ka printed review card QR) → variant "page", source CARD
//   - /bill/[orderId]        (WhatsApp bill ke neeche)             → variant "inline", source BILL
//   - order tracking page    (order SERVED hone ke baad)            → variant "inline", source STATUS
//
// ⚠️ GOOGLE POLICY: Google button HAMESHA sabko dikhta hai, hum rating nahi poochte aur
// kisi ko filter nahi karte ("review gating" Google mana karta hai, cafe ka profile
// suspend ho sakta hai). Private message sirf EXTRA option hai. Ise badalna mat.
//
// Privacy: sirf message + optional naam. Phone/email kabhi nahi maangte.

import { useEffect, useState } from 'react';
import { Check, ChevronDown, MessageSquareText, Star } from 'lucide-react';
import { publicMenuApi, type ReviewSource } from '@/lib/api';

const MESSAGE_LIMIT = 500;

interface ReviewPromptProps {
  slug: string;
  cafeName: string;
  googleReviewUrl: string | null;
  source: ReviewSource;
  orderId?: string;
  variant?: 'page' | 'inline';
}

export function ReviewPrompt({ slug, cafeName, googleReviewUrl, source, orderId, variant = 'inline' }: ReviewPromptProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPage = variant === 'page';

  const send = async () => {
    if (message.trim().length < 2) {
      setError('Please write a short message.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await publicMenuApi.submitFeedback(slug, {
        message: message.trim(),
        name: name.trim() || undefined,
        orderId,
        source,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section
      aria-labelledby={`review-h-${source}`}
      className={isPage ? '' : 'rounded-[20px] border border-line bg-surface p-5 print:hidden'}
    >
      {!isPage && (
        <>
          <h2 id={`review-h-${source}`} className="text-[17px] font-bold tracking-tight text-ink">
            Enjoyed your visit?
          </h2>
          <p className="mt-1 text-sm text-muted">A quick Google review helps {cafeName} a lot.</p>
        </>
      )}
      {isPage && (
        <h2 id={`review-h-${source}`} className="sr-only">
          Leave a review
        </h2>
      )}

      {googleReviewUrl && (
        <a
          href={googleReviewUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => publicMenuApi.recordReviewEvent(slug, 'GOOGLE_CLICK')}
          className={`flex w-full items-center justify-center gap-2 rounded-full bg-brand font-bold text-white shadow-[0_14px_30px_-14px_rgb(43_31_20/0.7)] transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.98] ${
            isPage ? 'mt-2 h-14 text-base' : 'mt-4 h-12 text-[15px]'
          }`}
        >
          <Star size={isPage ? 20 : 18} className="fill-roast-light text-roast-light" aria-hidden="true" />
          Rate us on Google
        </a>
      )}

      {/* ── Private message ── */}
      {sent ? (
        <div role="status" className="mt-4 flex animate-rise items-start gap-3 rounded-2xl bg-success-soft p-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-success">Thank you! {cafeName} will read your message.</p>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-line-strong bg-surface font-semibold text-ink transition-[transform,background-color] hover:bg-brand-soft active:scale-[0.98] ${
            isPage ? 'h-12 text-[15px]' : 'h-11 text-sm'
          }`}
          aria-expanded={false}
        >
          <MessageSquareText size={17} aria-hidden="true" />
          {googleReviewUrl ? 'Tell the owner privately' : 'Send feedback to the owner'}
          <ChevronDown size={16} className="text-muted" aria-hidden="true" />
        </button>
      ) : (
        <div className="mt-4 animate-rise rounded-2xl border border-line bg-paper p-4">
          <label htmlFor={`fb-msg-${source}`} className="flex items-center justify-between text-sm font-bold text-ink">
            Your message to the owner
            <span className="tabular text-xs font-normal text-muted">
              {message.length}/{MESSAGE_LIMIT}
            </span>
          </label>
          <textarea
            id={`fb-msg-${source}`}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value.slice(0, MESSAGE_LIMIT));
              if (error) setError(null);
            }}
            rows={3}
            autoFocus
            placeholder="What could we do better?"
            className="mt-2 w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-[15px] text-ink placeholder:text-muted focus:border-roast focus:outline-none"
          />
          <label htmlFor={`fb-name-${source}`} className="mt-3 block text-sm font-bold text-ink">
            Your name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`fb-name-${source}`}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            autoComplete="given-name"
            className="mt-2 h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink focus:border-roast focus:outline-none"
          />
          {error && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-brand text-sm font-bold text-white transition-[transform,background-color] hover:bg-brand-hover active:scale-[0.98] disabled:opacity-70"
          >
            {sending ? 'Sending…' : 'Send privately'}
          </button>
          <p className="mt-2 text-center text-xs text-muted">Only the café owner sees this. We never ask for your phone number.</p>
        </div>
      )}
    </section>
  );
}

/** Review page khulte hi ek baar "card scan" ginti (refresh pe dobara nahi — sessionStorage) */
export function CardViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const key = `br-review-view-${slug}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      // private mode / storage band — phir bhi ginti bhejo
    }
    publicMenuApi.recordReviewEvent(slug, 'CARD_VIEW');
  }, [slug]);
  return null;
}
