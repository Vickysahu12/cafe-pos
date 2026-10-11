// components/charts/SalesCurve.tsx
// ADDED (2026-10-11): Dashboard hero ka "aaj ki kahani" graph — aaj ki sales ghante-ghante JUDTI
// hui (cumulative) roast-gold curve, peeche kal ki dashed line. Ek nazar mein: "kal se aage hain
// ya peeche?" Owner ke liye ₹, Manager ke liye orders (analytics owner-only hai).
//
// Design:
//  - react-native-svg (Expo Go mein hai) — koi chart library / Reanimated nahi
//  - Monotone cubic curve (Fritsch–Carlson): cumulative data kabhi neeche nahi jaata, to curve
//    bhi kabhi "dip" nahi dikhati (normal smooth curves overshoot karke jhooth bolti hain)
//  - Aaj ki line abhi ke ghante pe rukti hai + glowing dot; kal ki line poore din ki
//  - Ghante: cafe ke khule ghante (data se), kam se kam 8 AM–10 PM
//  - Khaali din: flat line + dot (jhootha graph nahi)
//  - Dark (espresso hero) pe bana; accessibilityLabel mein poori baat likhi
// CONNECTED TO: app/(admin)/dashboard.tsx

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle, Line } from 'react-native-svg';
import { brand, font } from '../../theme/brand';

interface Props {
  /** 24 values (0–23 hour) — aaj, us ghante ka total (₹ ya orders) */
  today: number[];
  /** 24 values — kal (optional) */
  yesterday?: number[] | null;
  /** abhi ka ghanta (0–23) — aaj ki line yahin rukti hai */
  nowHour: number;
  height?: number;
  formatValue: (n: number) => string;
}

type Pt = { x: number; y: number };

/** Monotone cubic path (Fritsch–Carlson) — overshoot nahi */
function monotonePath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const s = 3 / Math.sqrt(h);
      t[i] = s * a * m[i];
      t[i + 1] = s * b * m[i];
    }
  }
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = pts[i].x + dx[i] / 3;
    const c1y = pts[i].y + (t[i] * dx[i]) / 3;
    const c2x = pts[i + 1].x - dx[i] / 3;
    const c2y = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return d;
}

function cumulative(arr: number[]): number[] {
  let s = 0;
  return arr.map((v) => (s += Math.max(0, v || 0)));
}

function hourShort(h: number): string {
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${h < 12 ? 'am' : 'pm'}`;
}

export function SalesCurve({ today, yesterday, nowHour, height = 92, formatValue }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const model = useMemo(() => {
    const t = Array.from({ length: 24 }, (_, i) => today[i] ?? 0);
    const y = yesterday ? Array.from({ length: 24 }, (_, i) => yesterday[i] ?? 0) : null;
    // Khule ghante: jahan kisi din kuch hua, kam se kam 8–22, aur abhi ka ghanta shamil
    const active = [...t.keys()].filter((h) => t[h] > 0 || (y && y[h] > 0));
    const start = Math.min(8, ...(active.length ? active : [8]), nowHour);
    const end = Math.max(22, ...(active.length ? active : [22]), nowHour);
    const cumT = cumulative(t);
    const cumY = y ? cumulative(y) : null;
    const todayEnd = Math.min(Math.max(nowHour, start), end);
    const max = Math.max(1, cumT[todayEnd], cumY ? cumY[end] : 0);
    const yesterdayByNow = cumY ? cumY[todayEnd] : null;
    return { start, end, cumT, cumY, todayEnd, max, total: cumT[todayEnd], yesterdayByNow };
  }, [today, yesterday, nowHour]);

  const padTop = 10;
  const chartH = height - 22; // neeche labels ke liye jagah
  // x-axis = ghanton ki boundaries: start (khulne ka pal) … end+1 (aakhri ghante ka ant)
  const span = Math.max(1, model.end + 1 - model.start);
  const xOf = (h: number) => (width * (h - model.start)) / span;
  const yOf = (v: number) => padTop + (chartH - padTop) * (1 - v / model.max);

  const paths = useMemo(() => {
    if (width === 0) return null;
    // Har ghante ke END pe cumulative value (h → h+1 boundary) — curve ghante ke saath chadhti hai
    // Boundary h pe value = h se pehle ke ghanton ka jod
    const before = (cum: number[], h: number) => (h <= 0 ? 0 : cum[h - 1] ?? 0);
    const todayPts: Pt[] = [];
    for (let h = model.start; h <= model.todayEnd; h++) todayPts.push({ x: xOf(h), y: yOf(before(model.cumT, h)) });
    // aakhri point: abhi tak ka total, abhi ke ghante ke beech mein (minute ke hisaab se)
    const nowFrac = Math.max(0.05, Math.min(1, new Date().getMinutes() / 60));
    const lastX = xOf(model.todayEnd + nowFrac);
    todayPts.push({ x: lastX, y: yOf(model.cumT[model.todayEnd]) });
    const tLine = monotonePath(todayPts);
    const tArea = `${tLine} L${lastX},${chartH} L${todayPts[0].x},${chartH} Z`;
    let yLine = '';
    if (model.cumY) {
      const yPts: Pt[] = [];
      for (let h = model.start; h <= model.end; h++) yPts.push({ x: xOf(h), y: yOf(before(model.cumY, h)) });
      yPts.push({ x: xOf(model.end + 1), y: yOf(model.cumY[model.end]) });
      yLine = monotonePath(yPts);
    }
    return { tLine, tArea, yLine, dot: { x: lastX, y: yOf(model.cumT[model.todayEnd]) } };
  }, [width, model, chartH]); // xOf/yOf inhi values se bante hain

  // Axis labels: shuru, beech ke 2, aakhri
  const labels = useMemo(() => {
    const out: number[] = [];
    const step = Math.max(1, Math.round(span / 4));
    for (let h = model.start; h <= model.end; h += step) out.push(h);
    return out.slice(0, 5);
  }, [model.start, model.end, span]);

  const a11y =
    `Sales so far today ${formatValue(model.total)}` +
    (model.yesterdayByNow !== null ? `. Yesterday by this time ${formatValue(model.yesterdayByNow)}` : '');

  return (
    <View onLayout={onLayout} style={{ height }} accessible accessibilityLabel={a11y}>
      {paths && (
        <Svg width={width} height={chartH}>
          <Defs>
            <LinearGradient id="todayFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={brand.roast} stopOpacity={0.45} />
              <Stop offset="1" stopColor={brand.roast} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line x1={0} y1={chartH - 0.5} x2={width} y2={chartH - 0.5} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          {!!paths.yLine && (
            <Path d={paths.yLine} stroke="rgba(255,255,255,0.32)" strokeWidth={1.5} strokeDasharray="4 5" fill="none" />
          )}
          <Path d={paths.tArea} fill="url(#todayFill)" />
          <Path d={paths.tLine} stroke={brand.roastLight} strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <Circle cx={paths.dot.x} cy={paths.dot.y} r={8} fill={brand.roastLight} opacity={0.22} />
          <Circle cx={paths.dot.x} cy={paths.dot.y} r={4} fill={brand.roastLight} stroke={brand.espresso} strokeWidth={1.5} />
        </Svg>
      )}
      <View style={styles.axis} pointerEvents="none">
        {width > 0 &&
          labels.map((h) => (
            <Text key={h} style={[styles.axisText, { left: Math.min(Math.max(0, xOf(h) - 14), width - 30) }]}>
              {hourShort(h)}
            </Text>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  axis: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 16 },
  axisText: { position: 'absolute', width: 30, textAlign: 'center', fontSize: 11, fontFamily: font.regular, color: 'rgba(255,255,255,0.45)', fontVariant: ['tabular-nums'] },
});
