// components/inventory/StockAlertBanner.tsx
// ADDED (2026-10-09) — STOCK SOP: Owner/Manager ke phone pe live "Milk is running low · 1.2 L left".
// Backend order ke baad batata hai kaunsa item ABHI low/out hua (stock-events.ts → useStockSignal
// onAlerts). Har bill pe nahi — sirf threshold cross hone wale pal pe.
//  - Neeche tab bar ke upar (upar QR order banner hai — dono kabhi takraate nahi)
//  - Ek item ka alert is phone pe 30 min mein ek hi baar (rush mein shor nahi)
//  - Kai items ek saath → "3 items running low · Milk, Cups, Sugar"
//  - Tap → us item ki stock screen (ek) / Stock list (kai). X ya 7 sec mein khud band.
//  - Reduce motion → slide nahi, sirf fade. Screen reader announce.
// CONNECTED TO: app/(admin)/_layout.tsx, features/inventory/useStockSignal.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle, CircleSlash, X } from 'lucide-react-native';
import { useStockSignal, StockAlertPayload } from '../../features/inventory/useStockSignal';
import { haptics } from '../../lib/haptics';
import { formatQty } from '../../lib/units';
import { useReduceMotion } from '../ui/PressScale';
import { theme } from '../../theme';
import { ui } from '../../theme/ui';

const SHOW_MS = 7000;
const REPEAT_MS = 30 * 60 * 1000;

export function StockAlertBanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const [alerts, setAlerts] = useState<StockAlertPayload[]>([]);
  const lastShown = useRef(new Map<string, number>());
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const g = gen.current;
    Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      if (g === gen.current) setAlerts([]);
    });
  }, [anim]);

  const onAlerts = useCallback(
    (incoming: StockAlertPayload[]) => {
      const now = Date.now();
      const fresh = incoming.filter((a) => now - (lastShown.current.get(a.inventoryItemId) ?? 0) > REPEAT_MS);
      if (fresh.length === 0) return;
      fresh.forEach((a) => lastShown.current.set(a.inventoryItemId, now));
      gen.current += 1;
      setAlerts((cur) => {
        const merged = [...cur.filter((c) => !fresh.some((f) => f.inventoryItemId === c.inventoryItemId)), ...fresh];
        const first = merged[merged.length - 1];
        AccessibilityInfo.announceForAccessibility(
          merged.length === 1 ? `${first.name} is ${first.level === 'OUT' ? 'out of stock' : 'running low'}` : `${merged.length} stock items need attention`
        );
        return merged;
      });
      haptics.tap();
      anim.stopAnimation();
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(hide, SHOW_MS);
    },
    [anim, hide]
  );

  // Sirf alerts chahiye — list refetch ka kaam yahan nahi (onChange no-op)
  useStockSignal(() => {}, { onAlerts });
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  if (alerts.length === 0) return null;

  const anyOut = alerts.some((a) => a.level === 'OUT');
  const single = alerts.length === 1 ? alerts[0] : null;
  const title = single
    ? `${single.name} is ${single.level === 'OUT' ? 'out of stock' : 'running low'}`
    : `${alerts.length} items ${anyOut ? 'need restocking' : 'running low'}`;
  const sub = single
    ? `${formatQty(single.quantity, single.unit)} left${single.level === 'LOW' ? ` · alert at ${formatQty(single.lowStockAlertAt, single.unit)}` : ''}`
    : alerts.map((a) => a.name).slice(0, 3).join(', ') + (alerts.length > 3 ? ` +${alerts.length - 3}` : '');
  const tone = anyOut ? theme.colors.danger : theme.colors.warning;
  const Icon = anyOut ? CircleSlash : AlertTriangle;

  const open = () => {
    hide();
    if (single) router.push({ pathname: '/(admin)/inventory/[id]', params: { id: single.inventoryItemId } });
    else router.push('/(admin)/inventory');
  };

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: 64 + Math.max(insets.bottom, 10) + 12 }]}>
      <Animated.View
        style={[
          styles.toast,
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 16, 0] }) }] },
        ]}
        accessibilityLiveRegion="polite"
      >
        <Pressable style={styles.body} onPress={open} accessibilityRole="button" accessibilityLabel={`${title}. ${sub}. Open stock`}>
          <View style={[styles.icon, { backgroundColor: anyOut ? theme.colors.dangerLight : theme.colors.warningLight }]}>
            <Icon size={17} color={tone} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
          </View>
        </Pressable>
        <Pressable style={styles.close} onPress={hide} hitSlop={8} accessibilityRole="button" accessibilityLabel="Dismiss stock alert">
          <X size={16} color={theme.colors.textMuted} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, zIndex: 900, elevation: 10 },
  toast: { ...ui.card, ...ui.softShadow, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, minHeight: 60 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 14, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  sub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },
  close: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
});
