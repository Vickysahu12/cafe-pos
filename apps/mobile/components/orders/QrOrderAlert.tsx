// components/orders/QrOrderAlert.tsx
// ADDED (2026-10-09): COUNTER PE QR ORDER ALERT — chime + vibration + upar banner.
// Problem: customer QR se order karta tha to sirf kitchen tablet bajta tha. Counter wala
// phone (cashier / owner / manager) chupchaap list update karta — rush mein kisi ko pata
// nahi chalta, customer wait karta, lagta "QR system kaam nahi karta".
//
// Kaise kaam karta hai (admin + cashier layout mein EK baar mount, har screen pe dikhta hai):
//  - Socket `order:created` sunta hai. SIRF QR order (cashierId === null) pe alert —
//    counter pe khud banaya bill kabhi nahi bajta (banane wale ko pata hai).
//  - Duplicate guard: same order ka event dobara aaye (reconnect, do rooms) → ek hi alert.
//  - Rush: banner dikh raha ho aur aur QR orders aayein → "3 new QR orders" (har order pe
//    alag banner nahi). Chime 1.5s mein ek hi baar (useNewOrderAlert ka throttle).
//  - Sound setting (qr-alert-prefs.ts, per phone): OFF → banner + halki vibration, bina awaaz.
//  - App background mein tha → awaaz nahi (OS rok deta hai / galat waqt), wapas aate hi
//    banner "while you were away" ke saath dikhta hai — order chupchaap miss nahi hota.
//  - Banner 6 sec mein khud hat'ta hai; X dabao ya upar swipe karo to turant.
//    Tap → ek order = uska detail, kai orders = Orders list.
//  - Customer ka PHONE kabhi nahi dikhta (sirf naam) — banner screen pe sabko dikhta hai.
//  - Reduce motion ON → slide nahi, sirf fade. Screen reader ko text announce hota hai.
//  - Unmount (logout / role badla) pe SIRF apne listeners hatata hai — shared socket chalta rahe.
// CONNECTED TO: app/(admin)/_layout.tsx, app/(cashier)/_layout.tsx, features/orders/useNewOrderAlert.ts,
// features/orders/qr-alert-prefs.ts, lib/socket-client.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder, AppState, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type { Socket } from 'socket.io-client';
import { BellRing, X, ChevronRight } from 'lucide-react-native';
import type { OrderSummary } from '../../features/orders/orders.api';
import { useNewOrderAlert } from '../../features/orders/useNewOrderAlert';
import { useQrAlertPrefs } from '../../features/orders/qr-alert-prefs';
import { connectSocket } from '../../lib/socket-client';
import { haptics } from '../../lib/haptics';
import { formatINR } from '../../lib/format';
import { useReduceMotion } from '../ui/PressScale';
import { brand, font, radius } from '../../theme/brand';
import { ui } from '../../theme/ui';

const SHOW_MS = 6000;
const SEEN_CAP = 300; // itne order ids yaad — din bhar ke orders ke liye kaafi, memory bhi nahi badhti

const TYPE_LABEL: Record<OrderSummary['orderType'], string> = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

function describe(batch: OrderSummary[], away: boolean) {
  if (batch.length === 1) {
    const o = batch[0];
    const where = o.table ? `Table ${o.table.tableNumber}` : TYPE_LABEL[o.orderType] ?? 'Order';
    const parts = [where, o.customerName?.trim() || null, formatINR(o.netAmount)].filter(Boolean);
    return { title: `New QR order #${o.orderNumber}${away ? ' while you were away' : ''}`, sub: parts.join(' · ') };
  }
  const nums = [...batch].sort((a, b) => a.orderNumber - b.orderNumber).map((o) => `#${o.orderNumber}`);
  const shown = nums.length > 4 ? `${nums.slice(0, 3).join(', ')} +${nums.length - 3} more` : nums.join(', ');
  return { title: `${batch.length} new QR orders${away ? ' while you were away' : ''}`, sub: `${shown} · tap to view` };
}

export function QrOrderAlert({ base }: { base: '/(admin)' | '/(cashier)' }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const playChime = useNewOrderAlert();
  const soundOn = useQrAlertPrefs((s) => s.soundOn);
  const loadPrefs = useQrAlertPrefs((s) => s.load);

  const [batch, setBatch] = useState<OrderSummary[]>([]);
  const [away, setAway] = useState(false);

  // Socket listener ek baar lagta hai → latest values refs se (stale closure nahi)
  const batchRef = useRef<OrderSummary[]>([]);
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;
  const playRef = useRef(playChime);
  playRef.current = playChime;
  const seen = useRef(new Set<string>());
  const awayQueue = useRef<OrderSummary[]>([]);
  const awayRef = useRef(false);
  // Har naye present pe +1 — fade-out ke beech naya order aaye to purana dismiss use mitaye nahi
  const generation = useRef(0);
  const closing = useRef(false); // fade-out chal raha — naya order purane (band hote) banner mein na jude
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = useRef(new Animated.Value(0)).current; // 0 = chhupa, 1 = dikh raha
  const drag = useRef(new Animated.Value(0)).current; // swipe-up ke liye

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const clearTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  const dismiss = useCallback(() => {
    clearTimer();
    closing.current = true;
    const gen = generation.current;
    Animated.timing(enter, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      // Fade ke beech naya order aa gaya (present ne generation badha di) to banner mat mitao
      if (gen !== generation.current) return;
      batchRef.current = [];
      awayRef.current = false;
      setBatch([]);
      setAway(false);
      drag.setValue(0);
    });
  }, [enter, drag]);

  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const present = useCallback(
    (orders: OrderSummary[], opts: { sound: boolean; away: boolean }) => {
      if (orders.length === 0) return;
      // Banner pehle se dikh raha → jod do ("3 new QR orders"); warna naya batch
      const visible = batchRef.current.length > 0 && !closing.current;
      closing.current = false;
      const next = visible ? [...batchRef.current, ...orders.filter((o) => !batchRef.current.some((b) => b.id === o.id))] : orders;
      // "while you were away" tabhi jab POORA batch background wala ho
      const awayFlag = visible ? awayRef.current && opts.away : opts.away;
      generation.current += 1;
      batchRef.current = next;
      awayRef.current = awayFlag;
      setBatch(next);
      setAway(awayFlag);

      if (opts.sound) {
        if (soundOnRef.current) playRef.current(); // chime + vibration (khud throttle karta hai)
        else haptics.tap(); // sound off → sirf halki vibration
      }
      const { title, sub } = describe(next, awayFlag);
      AccessibilityInfo.announceForAccessibility(`${title}. ${sub}`);

      drag.setValue(0);
      enter.stopAnimation();
      Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      clearTimer();
      hideTimer.current = setTimeout(() => dismissRef.current(), SHOW_MS);
    },
    [enter, drag]
  );

  const presentRef = useRef(present);
  presentRef.current = present;

  // ── Socket ──
  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    const onCreated = (payload: { order?: OrderSummary } | undefined) => {
      const order = payload?.order;
      if (!order?.id) return;
      if (order.cashierId !== null) return; // counter / owner ka bill — alert nahi (undefined bhi nahi)
      if (seen.current.has(order.id)) return;
      seen.current.add(order.id);
      if (seen.current.size > SEEN_CAP) {
        const oldest = seen.current.values().next().value;
        if (oldest) seen.current.delete(oldest);
      }
      if (AppState.currentState !== 'active') {
        awayQueue.current.push(order);
        // Bahut der background mein raha → sirf aakhri 50 yaad (banner "N new QR orders" hi dikhata hai)
        if (awayQueue.current.length > 50) awayQueue.current.shift();
        return;
      }
      presentRef.current([order], { sound: true, away: false });
    };

    connectSocket()
      .then((s) => {
        if (cancelled) return;
        socket = s;
        s.on('order:created', onCreated);
      })
      .catch(() => {
        // socket na bane to bhi app chalta hai — Orders list/badge refetch se dikh jaata hai
      });

    return () => {
      cancelled = true;
      socket?.off('order:created', onCreated);
    };
  }, []);

  // ── App wapas foreground → jo orders background mein aaye, unka banner (bina awaaz) ──
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || awayQueue.current.length === 0) return;
      const queued = awayQueue.current;
      awayQueue.current = [];
      presentRef.current(queued, { sound: false, away: true });
    });
    return () => sub.remove();
  }, []);

  useEffect(() => () => clearTimer(), []);

  // ── Swipe up to dismiss ──
  const pan = useRef(
    PanResponder.create({
      // Capture: banner ke andar ka Pressable (tap) bhi ho to vertical swipe hum lete hain
      onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => clearTimer(), // pakda hua hai — beech mein khud na hate
      onPanResponderMove: (_e, g) => drag.setValue(Math.min(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy < -24 || g.vy < -0.5) {
          dismissRef.current();
        } else {
          Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
          clearTimer();
          hideTimer.current = setTimeout(() => dismissRef.current(), SHOW_MS / 2);
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        clearTimer();
        hideTimer.current = setTimeout(() => dismissRef.current(), SHOW_MS / 2);
      },
    })
  ).current;

  if (batch.length === 0) return null;

  const { title, sub } = describe(batch, away);
  const open = () => {
    const target = batch.length === 1 ? `${base}/orders/${batch[0].id}` : `${base}/orders`;
    dismiss();
    router.push(target as never);
  };

  const translateY = Animated.add(
    enter.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : -24, 0] }),
    drag
  );

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 8 }]}>
      <Animated.View
        {...pan.panHandlers}
        style={[styles.banner, { opacity: enter, transform: [{ translateY }] }]}
        accessibilityLiveRegion="assertive"
      >
        <Pressable
          style={styles.body}
          onPress={open}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${sub}. Opens ${batch.length === 1 ? 'the order' : 'orders'}.`}
        >
          <View style={styles.icon}>
            <BellRing size={18} color={brand.espresso} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
          </View>
          <ChevronRight size={16} color="rgba(255,255,255,0.55)" />
        </Pressable>
        <Pressable style={styles.close} onPress={dismiss} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss alert">
          <X size={16} color="rgba(255,255,255,0.75)" />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 1000, elevation: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: brand.espresso,
    borderRadius: radius.lg,
    paddingLeft: 12,
    paddingRight: 6,
    minHeight: 64,
    ...ui.softShadow,
    shadowOpacity: 0.22,
    elevation: 12,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: brand.roastLight, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 15, fontFamily: font.semibold, color: brand.white, fontVariant: ['tabular-nums'] },
  sub: { fontSize: 13, fontFamily: font.regular, color: 'rgba(255,255,255,0.72)', marginTop: 2, fontVariant: ['tabular-nums'] },
  close: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 2 },
});
