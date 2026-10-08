// components/charts/BarChart.tsx
// USE CASE (2026-09-30): Sales Report ka bar chart (daily revenue 7/30 din, hourly sales).
// react-native-svg se khud banaya — koi naya chart package nahi (app size + Expo Go safe).
//
// Design rules (dataviz skill):
//  - Single series = ek hi brand colour, legend nahi (title hi naam batata hai)
//  - Bar ka upar wala sira 4px rounded, neeche baseline pe seedha
//  - Grid/axis halke (recessive), ₹ labels compact Indian style (₹1.2k, ₹1.5L)
//  - Tap = select: chuna hua bar poora rang, baaki halke; parent upar value dikhata hai
//  - Har bar ka tap area poori column (bar se bada) + screen-reader label

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { theme } from '../../theme';

export interface BarDatum {
  key: string;
  value: number;
  /** x-axis label (sirf kuch bars ke neeche dikhta hai) */
  label: string;
  /** screen reader ke liye poora description */
  a11yLabel: string;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  formatAxis: (value: number) => string;
  /** har kitne bar pe x-label (7 din = 1, 30 din = 5) */
  labelEvery?: number;
}

const BAR_COLOR = theme.colors.primary;
const BAR_MUTED = '#E3D3B5'; // primary ka halka step — unselected bars
const GRID = '#EAE5DC';
const Y_AXIS_WIDTH = 44;
const X_AXIS_HEIGHT = 22;
const RADIUS = 4;

/** Axis max ko "saaf" number pe round karo (1,2,2.5,5 × 10^n) */
function niceMax(max: number): number {
  if (max <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

/** Upar se rounded, neeche se seedha bar ka path */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  const base = y + h;
  return `M${x},${base} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${base} Z`;
}

export function BarChart({ data, height = 200, selectedIndex, onSelect, formatAxis, labelEvery = 1 }: BarChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const plotW = Math.max(0, width - Y_AXIS_WIDTH);
  const plotH = height - X_AXIS_HEIGHT;
  const maxY = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const slot = data.length > 0 ? plotW / data.length : 0;
  // Bar slot ka ~62% (7 bars pe mote, 30 pe patle) — beech mein hamesha gap rahe
  const barW = Math.max(3, Math.min(28, slot * 0.62));
  const ticks = [0, maxY / 2, maxY];

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 && (
        <>
          <Svg width={width} height={plotH} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {ticks.map((t) => {
              const y = plotH - (t / maxY) * (plotH - 8);
              return <Line key={t} x1={Y_AXIS_WIDTH} x2={width} y1={y} y2={y} stroke={GRID} strokeWidth={1} />;
            })}
            {data.map((d, i) => {
              if (d.value <= 0) return null;
              const h = Math.max(2, (d.value / maxY) * (plotH - 8));
              const x = Y_AXIS_WIDTH + i * slot + (slot - barW) / 2;
              const active = selectedIndex === null || selectedIndex === i;
              return <Path key={d.key} d={barPath(x, plotH - h, barW, h)} fill={active ? BAR_COLOR : BAR_MUTED} />;
            })}
          </Svg>

          {/* Y-axis labels */}
          {ticks.map((t) => {
            const y = plotH - (t / maxY) * (plotH - 8);
            return (
              <Text key={`y${t}`} style={[styles.yLabel, { top: y - 8 }]} numberOfLines={1}>
                {formatAxis(t)}
              </Text>
            );
          })}

          {/* Tap targets — poori column, bar se bada */}
          <View style={[styles.hitRow, { left: Y_AXIS_WIDTH, height: plotH }]}>
            {data.map((d, i) => (
              <Pressable
                key={d.key}
                style={{ width: slot, height: plotH }}
                onPress={() => onSelect(i)}
                accessibilityRole="button"
                accessibilityLabel={d.a11yLabel}
                accessibilityState={{ selected: selectedIndex === i }}
              />
            ))}
          </View>

          {/* X-axis labels */}
          <View style={[styles.xRow, { left: Y_AXIS_WIDTH, top: plotH + 4 }]}>
            {data.map((d, i) => {
              const show = i % labelEvery === 0 || i === data.length - 1;
              return (
                <View key={d.key} style={{ width: slot, alignItems: 'center' }}>
                  {show && (
                    <Text
                      style={[styles.xLabel, selectedIndex === i && styles.xLabelActive]}
                      numberOfLines={1}
                    >
                      {d.label}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: 'absolute', left: 0, width: Y_AXIS_WIDTH - 6, textAlign: 'right', fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },
  hitRow: { position: 'absolute', top: 0, flexDirection: 'row' },
  xRow: { position: 'absolute', flexDirection: 'row' },
  xLabel: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, minWidth: 32, textAlign: 'center' },
  xLabelActive: { color: theme.colors.textPrimary, fontFamily: theme.typography.font.bold},
});
