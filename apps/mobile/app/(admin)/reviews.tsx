// app/(admin)/reviews.tsx
// ADDED (2026-10-05): REVIEW BOOSTER — Owner/Manager ka "Reviews & Feedback" screen.
// USE CASE: 3 kaam, ek screen pe:
//   1. Google review link jodna (ek baar, 2 min) — "How to find it" steps ke saath
//   2. Printable review card (counter ke liye) — web pe A6 print page khulta hai
//   3. Ginti (card scans, Google taps, private messages) + customers ke private messages
//
// ⚠️ GOOGLE POLICY: customer side pe Google button sabko dikhta hai, rating filter nahi
// (dekho apps/web/components/ReviewPrompt.tsx). Is screen pe bhi kabhi "only happy
// customers" jaisa feature mat jodna — cafe ka Google profile suspend ho sakta hai.
//
// CONNECTED TO: features/reviews/reviews.api.ts, lib/config.ts (ORDER_WEB_URL),
//               Settings → "Reviews & Feedback", backend modules/reviews.

import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, Linking, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Star, Printer, Share2, MessageSquareText, ScanLine, CheckCircle2, ChevronDown, ChevronUp,
  ExternalLink, Link2, Receipt, Smartphone,
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { reviewsApi, ReviewSummary, FeedbackItem, ReviewSource } from '../../features/reviews/reviews.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { useScreenLoad } from '../../lib/use-screen-load';
import { getErrorMessage } from '../../lib/api-client';
import { ORDER_WEB_URL } from '../../lib/config';
import { haptics } from '../../lib/haptics';
import { TextField } from '../../components/ui/TextField';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';
import { Skeleton, SkeletonStatCard } from '../../components/ui/Skeleton';
import { theme } from '../../theme';

const SOURCE_LABEL: Record<ReviewSource, { label: string; icon: typeof Receipt }> = {
  CARD: { label: 'Review card', icon: ScanLine },
  BILL: { label: 'WhatsApp bill', icon: Receipt },
  STATUS: { label: 'QR order', icon: Smartphone },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "just now" / "5 min ago" / "3 h ago" / "4 Oct" — Intl ke bina (Hermes-safe) */
function timeAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function ReviewsScreen() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);

  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [editingLink, setEditingLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | undefined>();
  const [showHelp, setShowHelp] = useState(false);

  const { loading, refreshing, error, refresh, retry } = useScreenLoad(async () => {
    const [s, f] = await Promise.all([reviewsApi.getSummary(30), reviewsApi.listFeedback()]);
    setSummary(s);
    setFeedback(f);
    if (!s.googleReviewUrl) setEditingLink(true);
    // Dekh liya → agli baar "new" nahi (is baar abhi bhi highlight dikhega, readAt purana data hai)
    if (s.unread > 0) reviewsApi.markAllRead().catch(() => {});
  });

  const reviewPageUrl = summary?.slug ? `${ORDER_WEB_URL}/review/${summary.slug}` : '';
  const cardUrl = summary?.slug ? `${ORDER_WEB_URL}/review/${summary.slug}/card` : '';

  const saveLink = async (value: string | null) => {
    setSaving(true);
    setLinkError(undefined);
    try {
      const res = await reviewsApi.saveGoogleReviewUrl(value);
      setSummary((s) => (s ? { ...s, googleReviewUrl: res.googleReviewUrl } : s));
      setEditingLink(!res.googleReviewUrl);
      setLinkInput('');
      haptics.success();
    } catch (err) {
      setLinkError(getErrorMessage(err));
      haptics.error();
    } finally {
      setSaving(false);
    }
  };

  const confirmRemove = () =>
    Alert.alert('Remove Google link?', 'Customers will only see the private feedback option until you add it again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => saveLink(null) },
    ]);

  const shareReviewLink = () => {
    if (!reviewPageUrl) return;
    Share.share({ message: `How was your visit to ${summary?.outletName ?? 'our café'}? Leave us a review: ${reviewPageUrl}` }).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Reviews & Feedback</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <View style={styles.content}>
          <Skeleton height={96} radius={theme.radius.lg} />
          <View style={[styles.statsRow, { marginTop: theme.spacing.lg }]}>
            <SkeletonStatCard style={{ flex: 1 }} />
            <SkeletonStatCard style={{ flex: 1 }} />
            <SkeletonStatCard style={{ flex: 1 }} />
          </View>
          <Skeleton height={180} radius={theme.radius.lg} style={{ marginTop: theme.spacing.lg }} />
        </View>
      ) : error && !summary ? (
        <ErrorState message={error} onRetry={retry} />
      ) : summary ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Intro ── */}
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Star size={22} color="#B7791F" fill="#F6C453" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle}>More Google reviews, automatically</Text>
              <Text style={styles.heroText}>
                Every customer is asked at the right moment: on the review card at your counter, on the WhatsApp bill,
                and after a QR order is served. Complaints can come to you privately.
              </Text>
            </View>
          </View>

          {/* ── Stats (30 days) ── */}
          <Text style={styles.sectionLabel}>LAST 30 DAYS</Text>
          <View style={styles.statsRow}>
            <Stat icon={ScanLine} value={summary.cardScans} label="Card scans" />
            <Stat icon={Star} value={summary.googleTaps} label="Google taps" />
            <Stat icon={MessageSquareText} value={summary.privateMessages} label="Messages" />
          </View>
          <Text style={styles.statsNote}>
            "Google taps" = customers who opened Google's review form. Google doesn't tell us if they posted it.
          </Text>

          {/* ── Step 1: Google link ── */}
          <Text style={styles.sectionLabel}>STEP 1 · YOUR GOOGLE REVIEW LINK</Text>
          <View style={styles.card}>
            {summary.googleReviewUrl && !editingLink ? (
              <>
                <View style={styles.connectedRow}>
                  <CheckCircle2 size={20} color={theme.colors.success} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.connectedTitle}>Connected</Text>
                    <Text style={styles.connectedUrl} numberOfLines={1}>
                      {summary.googleReviewUrl.replace(/^https?:\/\//, '')}
                    </Text>
                  </View>
                </View>
                <View style={styles.inlineActions}>
                  <Pressable style={styles.inlineBtn} onPress={() => Linking.openURL(summary.googleReviewUrl!)}>
                    <ExternalLink size={15} color={theme.colors.primary} />
                    <Text style={styles.inlineBtnText}>Test link</Text>
                  </Pressable>
                  {role === 'OWNER' || role === 'MANAGER' ? (
                    <>
                      <Pressable style={styles.inlineBtn} onPress={() => setEditingLink(true)}>
                        <Link2 size={15} color={theme.colors.primary} />
                        <Text style={styles.inlineBtnText}>Change</Text>
                      </Pressable>
                      <Pressable style={styles.inlineBtn} onPress={confirmRemove}>
                        <Text style={[styles.inlineBtnText, { color: theme.colors.danger }]}>Remove</Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </>
            ) : (
              <>
                <TextField
                  label="Paste your Google review link"
                  placeholder="g.page/r/…/review"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  value={linkInput}
                  onChangeText={(v) => {
                    setLinkInput(v);
                    if (linkError) setLinkError(undefined);
                  }}
                  error={linkError}
                />
                <Button title="Save link" onPress={() => saveLink(linkInput)} loading={saving} disabled={!linkInput.trim()} />
                {summary.googleReviewUrl && (
                  <Pressable style={styles.cancelEdit} onPress={() => { setEditingLink(false); setLinkError(undefined); }}>
                    <Text style={styles.cancelEditText}>Cancel</Text>
                  </Pressable>
                )}
              </>
            )}

            <Pressable style={styles.helpToggle} onPress={() => setShowHelp((v) => !v)}>
              <Text style={styles.helpToggleText}>How do I find my link?</Text>
              {showHelp ? <ChevronUp size={16} color={theme.colors.textSecondary} /> : <ChevronDown size={16} color={theme.colors.textSecondary} />}
            </Pressable>
            {showHelp && (
              <View style={styles.helpBox}>
                <HelpStep n={1} text="On your phone, search your café's name on Google (you must be logged in with the account that manages it)." />
                <HelpStep n={2} text={'In your business panel, tap "Ask for reviews" (or "Get more reviews").'} />
                <HelpStep n={3} text={'Tap "Copy link". It looks like g.page/r/…/review. Paste it above.'} />
                <Text style={styles.helpNote}>No Google Business Profile yet? Create one free at business.google.com.</Text>
              </View>
            )}
          </View>

          {/* ── Step 2: Review card ── */}
          <Text style={styles.sectionLabel}>STEP 2 · REVIEW CARD FOR YOUR COUNTER</Text>
          <View style={styles.card}>
            {!summary.googleReviewUrl && (
              <View style={styles.warnBox}>
                <Text style={styles.warnText}>
                  Add your Google link first. Until then, the card only shows the private feedback option.
                </Text>
              </View>
            )}
            <View style={styles.cardPreview}>
              <View style={styles.cardPreviewBand}>
                <Text style={styles.cardPreviewCafe} numberOfLines={1}>{summary.outletName}</Text>
              </View>
              <Text style={styles.cardPreviewTitle}>Enjoyed your visit?</Text>
              <View style={styles.qrBox}>
                {!!reviewPageUrl && <QRCode value={reviewPageUrl} size={120} color="#1A140E" backgroundColor="#FFFFFF" ecl="M" />}
              </View>
              <Text style={styles.cardPreviewCta}>Scan to rate us on Google</Text>
            </View>

            <Pressable style={styles.primaryButton} onPress={() => cardUrl && Linking.openURL(cardUrl)}>
              <Printer size={18} color={theme.colors.white} />
              <Text style={styles.primaryButtonText}>Print review card</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={shareReviewLink}>
              <Share2 size={17} color={theme.colors.primary} />
              <Text style={styles.secondaryButtonText}>Share review link</Text>
            </Pressable>
            <Text style={styles.cardTip}>
              "Print review card" opens a print-ready A6 card. Save it as PDF and get it printed and laminated at any print shop.
            </Text>
          </View>

          {/* ── Private messages ── */}
          <Text style={styles.sectionLabel}>PRIVATE MESSAGES FROM CUSTOMERS</Text>
          {error && <ErrorBanner message={error} />}
          {feedback.length === 0 ? (
            <View style={styles.card}>
              <EmptyState
                icon={MessageSquareText}
                title="No messages yet"
                message="When a customer taps “Tell the owner privately”, their message appears here."
              />
            </View>
          ) : (
            <View style={styles.card}>
              {feedback.map((f, i) => {
                const src = SOURCE_LABEL[f.source];
                const isNew = !f.readAt;
                return (
                  <View key={f.id} style={[styles.feedbackItem, i > 0 && styles.feedbackDivider]}>
                    <View style={styles.feedbackMeta}>
                      {isNew && <View style={styles.newDot} />}
                      <src.icon size={13} color={theme.colors.textMuted} />
                      <Text style={styles.feedbackMetaText}>
                        {src.label} · {timeAgo(f.createdAt)}
                      </Text>
                    </View>
                    <Text style={styles.feedbackMessage}>{f.message}</Text>
                    {!!f.name && <Text style={styles.feedbackName}>— {f.name}</Text>}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Star; value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Icon size={16} color={theme.colors.textMuted} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function HelpStep({ n, text }: { n: number; text: string }) {
  return (
    <View style={styles.helpStep}>
      <View style={styles.helpNum}>
        <Text style={styles.helpNumText}>{n}</Text>
      </View>
      <Text style={styles.helpText}>{text}</Text>
    </View>
  );
}

const ESPRESSO = '#2B1F14';

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.surface, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  backBtn: { width: 38, height: 38, borderRadius: theme.radius.full, backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },

  hero: { flexDirection: 'row', gap: theme.spacing.md, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: theme.radius.lg, padding: theme.spacing.lg },
  heroIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  heroTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  heroText: { marginTop: 4, fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },

  sectionLabel: { fontSize: 12, fontWeight: theme.typography.weight.bold, color: theme.colors.textMuted, letterSpacing: 0.6, marginTop: theme.spacing.xl, marginBottom: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  stat: { flex: 1, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.lg, padding: theme.spacing.md, gap: 4 },
  statValue: { fontSize: 22, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary },
  statsNote: { marginTop: theme.spacing.sm, fontSize: 12, lineHeight: 17, color: theme.colors.textMuted },

  card: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg },
  connectedRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  connectedTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.success },
  connectedUrl: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  inlineActions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md, flexWrap: 'wrap' },
  inlineBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: theme.radius.full, backgroundColor: theme.colors.background },
  inlineBtnText: { fontSize: 13, fontWeight: theme.typography.weight.semibold, color: theme.colors.primary },
  cancelEdit: { alignItems: 'center', paddingTop: theme.spacing.md },
  cancelEditText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },

  helpToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.lg, paddingTop: theme.spacing.md, borderTopWidth: 1, borderTopColor: theme.colors.border },
  helpToggleText: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },
  helpBox: { marginTop: theme.spacing.md, gap: theme.spacing.md },
  helpStep: { flexDirection: 'row', gap: theme.spacing.md },
  helpNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.primaryLight, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  helpNumText: { fontSize: 12, fontWeight: theme.typography.weight.bold, color: theme.colors.primary },
  helpText: { flex: 1, fontSize: 13, lineHeight: 19, color: theme.colors.textPrimary },
  helpNote: { fontSize: 12, lineHeight: 17, color: theme.colors.textMuted },

  warnBox: { backgroundColor: theme.colors.warningLight, borderRadius: theme.radius.md, padding: theme.spacing.md, marginBottom: theme.spacing.md },
  warnText: { fontSize: 13, lineHeight: 18, color: '#92400E' },
  cardPreview: { alignSelf: 'center', width: 200, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#FFFFFF', overflow: 'hidden', alignItems: 'center', paddingBottom: theme.spacing.lg, marginBottom: theme.spacing.lg },
  cardPreviewBand: { alignSelf: 'stretch', backgroundColor: ESPRESSO, paddingVertical: 10, paddingHorizontal: 12 },
  cardPreviewCafe: { color: '#FFFFFF', fontWeight: theme.typography.weight.bold, fontSize: 13 },
  cardPreviewTitle: { marginTop: theme.spacing.md, fontSize: 15, fontWeight: theme.typography.weight.bold, color: '#1A140E' },
  qrBox: { marginTop: theme.spacing.sm, padding: 8, borderRadius: 12, borderWidth: 2, borderColor: '#D9B77A' },
  cardPreviewCta: { marginTop: theme.spacing.sm, fontSize: 12, fontWeight: theme.typography.weight.semibold, color: '#1A140E' },
  primaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, height: 52, borderRadius: theme.radius.md, backgroundColor: theme.colors.primary },
  primaryButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
  secondaryButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm, height: 48, borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.border, marginTop: theme.spacing.sm },
  secondaryButtonText: { color: theme.colors.primary, fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold },
  cardTip: { marginTop: theme.spacing.md, fontSize: 12, lineHeight: 17, color: theme.colors.textMuted, textAlign: 'center' },

  feedbackItem: { paddingVertical: theme.spacing.md },
  feedbackDivider: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  feedbackMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedbackMetaText: { fontSize: 12, color: theme.colors.textMuted },
  newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  feedbackMessage: { marginTop: 6, fontSize: theme.typography.size.sm, lineHeight: 20, color: theme.colors.textPrimary },
  feedbackName: { marginTop: 4, fontSize: 13, color: theme.colors.textSecondary },
});
