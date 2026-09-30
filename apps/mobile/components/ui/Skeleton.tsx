// components/ui/Skeleton.tsx
// USE CASE (2026-09-30): Loading ke waqt spinner ki jagah "skeleton" — screen ka
// grey outline pehle dikh jaata hai, phir data bhar jaata hai. Isse app zyada fast
// aur professional lagta hai (Swiggy/Zomato/Petpooja jaisa), aur layout jump nahi hota.
// Ek hi shared pulse animation sab blocks chalate hain (native driver, 60fps, cheap).
// CONNECTED TO: har list/dashboard screen ka loading state.

import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, ViewStyle, StyleProp, DimensionValue } from 'react-native';
import { theme } from '../../theme';

// Ek hi Animated value poori app mein — 50 skeleton blocks = 1 animation loop, 50 nahi
const pulse = new Animated.Value(0.5);
let running = false;
function ensurePulse() {
  if (running) return;
  running = true;
  Animated.loop(
    Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
    ])
  ).start();
}

interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Ek grey pulsing block — text line, avatar, card, kuch bhi */
export function Skeleton({ width = '100%', height = 14, radius = theme.radius.sm, style }: SkeletonProps) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      ensurePulse();
    }
  }, []);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: SKELETON_COLOR, opacity: pulse }, style]}
    />
  );
}

const SKELETON_COLOR = '#E5E7EB';

/** List row jaisa skeleton: avatar + 2 text lines + right side pill */
export function SkeletonRow({ avatar = true, trailing = true }: { avatar?: boolean; trailing?: boolean }) {
  return (
    <View style={styles.row}>
      {avatar && <Skeleton width={44} height={44} radius={theme.radius.md} />}
      <View style={styles.rowText}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="35%" height={12} style={{ marginTop: 8 }} />
      </View>
      {trailing && <Skeleton width={56} height={28} radius={theme.radius.full} />}
    </View>
  );
}

/** Poori list ka skeleton — `count` rows */
export function SkeletonList({ count = 6, avatar, trailing }: { count?: number; avatar?: boolean; trailing?: boolean }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} avatar={avatar} trailing={trailing} />
      ))}
    </View>
  );
}

/** Stat/KPI card skeleton (dashboard ke liye) */
export function SkeletonStatCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.card, style]}>
      <Skeleton width={32} height={32} radius={theme.radius.md} />
      <Skeleton width="50%" height={12} style={{ marginTop: 12 }} />
      <Skeleton width="70%" height={22} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, gap: theme.spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  rowText: { flex: 1 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
});
