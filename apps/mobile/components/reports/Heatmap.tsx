// components/reports/Heatmap.tsx
// ADDED (2026-10-09): Reports → "Busy hours" — din (Mon..Sun) × ghanta grid. Jitna gehra rang,
// utne zyada orders (pichle 4 hafte ka average). Owner ko seedha dikhe "Shanivaar 7 baje sabse
// zyada rush hai → us din ek extra staff rakho / us waqt combo offer mat do".
//
// Design: plain RN Views (koi chart library / Reanimated nahi — Expo Go safe). Espresso rang ki
// opacity = intensity (brand ke saath, koi rainbow nahi). Cell tap = upar readout. Columns sirf
// cafe ke khule ghanton ke (data se nikaale), taaki 24 patli patti na banein.
// CONNECTED TO: app/(admin)/sales-report.tsx, features/analytics/analytics.api.ts (Insights.heatmap)

import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../theme';
import { haptics } from '../../lib/haptics';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EMPTY_CELL = '#F1ECE4';

/** 0-23 → "9am" / "12pm" (axis ke liye chhota) */
function shortHour(h: number): string {
  const n = h % 12 === 0 ? 12 : h % 12;
  return `${n}${h < 12 ? 'am' : 'pm'}`;
}

/** 19 → "7–8 PM" */
export function hourRange(h: number): string {
  const fmt = (x: number) => `${x % 12 === 0 ? 12 : x % 12}`;
  const next = (h + 1) % 24;
  const sameHalf = h < 12 === next < 12 && next !== 0;
  return sameHalf ? `${fmt(h)}–${fmt(next)} ${h < 12 ? 'AM' : 'PM'}` : `${fmt(h)} ${h < 12 ? 'AM' : 'PM'}–${fmt(next)} ${next < 12 ? 'AM' : 'PM'}`;
}

function formatAvg(v: number): string {
  if (v <= 0) return 'No orders';
  if (v < 1) return 'Less than 1 order';
  const r = Math.round(v * 10) / 10;
  return `${r % 1 === 0 ? r.toFixed(0) : r.toFixed(1)} order${r === 1 ? '' : 's'}`;
}

function cellColor(v: number, max: number): string {
  if (v <= 0 || max <= 0) return EMPTY_CELL;
  const alpha = 0.16 + 0.84 * Math.min(1, v / max);
  return `rgba(43,31,20,${alpha.toFixed(2)})`;
}

interface HeatmapProps {
  /** [Mon..Sun][0..23] average orders */
  data: number[][];
  peak: { day: number; hour: number; avgOrders: number } | null;
}

export function Heatmap({ data, peak }: HeatmapProps) {
  const [selected, setSelected] = useState<{ day: number; hour: number } | null>(null);

  // Khule ghante: jis ghante kisi bhi din order aaya. Kam se kam 6 columns (warna cells bahut chaude).
  const { hours, max } = useMemo(() => {
    let lo = 24;
    let hi = -1;
    let m = 0;
    data.forEach((row) =>
      row.forEach((v, h) => {
        if (v > 0) {
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          m = Math.max(m, v);
        }
      })
    );
    if (hi < 0) return { hours: [] as number[], max: 0 };
    while (hi - lo + 1 < 6) {
      if (hi < 23) hi++;
      else lo--;
    }
    return { hours: Array.from({ length: hi - lo + 1 }, (_, i) => lo + i), max: m };
  }, [data]);

  if (hours.length === 0) return null;

  const focus = selected ?? (peak ? { day: peak.day, hour: peak.hour } : null);
  const focusValue = focus ? data[focus.day]?.[focus.hour] ?? 0 : 0;

  return (
    <View>
      {focus && (
        <View style={styles.readout} accessibilityLiveRegion="polite">
          <Text style={styles.readoutTitle}>
            {DAY_NAMES[focus.day]}, {hourRange(focus.hour)}
            {!selected && <Text style={styles.readoutTag}>  · Busiest</Text>}
          </Text>
          <Text style={styles.readoutSub}>{formatAvg(focusValue)} on average</Text>
        </View>
      )}

      {DAY_LABELS.map((label, d) => (
        <View key={label} style={styles.row}>
          <Text style={styles.dayLabel}>{label}</Text>
          <View style={styles.cells}>
            {hours.map((h) => {
              const v = data[d]?.[h] ?? 0;
              const isFocus = focus?.day === d && focus?.hour === h;
              return (
                <Pressable
                  key={h}
                  style={[styles.cell, { backgroundColor: cellColor(v, max) }, isFocus && styles.cellFocus]}
                  onPress={() => {
                    haptics.tap();
                    setSelected({ day: d, hour: h });
                  }}
                  hitSlop={2}
                  accessibilityRole="button"
                  accessibilityLabel={`${DAY_NAMES[d]} ${hourRange(h)}: ${formatAvg(v)} on average`}
                />
              );
            })}
          </View>
        </View>
      ))}

      {/* Hour axis — har 3 ghante pe label, same flex cells taaki label sahi column ke neeche aaye */}
      <View style={styles.row}>
        <View style={styles.dayLabelSpacer} />
        <View style={styles.cells}>
          {hours.map((h, i) => (
            <View key={h} style={styles.axisCell}>
              {(i === 0 || h % 3 === 0) && i < hours.length - 1 && (
                <Text style={styles.axisText} numberOfLines={1}>{shortHour(h)}</Text>
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>Fewer</Text>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <View key={t} style={[styles.legendSwatch, { backgroundColor: t === 0 ? EMPTY_CELL : cellColor(t, 1) }]} />
        ))}
        <Text style={styles.legendText}>More orders</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { marginBottom: theme.spacing.md },
  readoutTitle: { fontSize: theme.typography.size.base, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  readoutTag: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.accentInk },
  readoutSub: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, fontVariant: ['tabular-nums'] },

  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  dayLabel: { width: 34, fontSize: 11, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  dayLabelSpacer: { width: 34 },
  cells: { flex: 1, flexDirection: 'row', gap: 3 },
  cell: { flex: 1, height: 22, borderRadius: 4 },
  cellFocus: { borderWidth: 2, borderColor: theme.colors.accent },
  axisCell: { flex: 1, height: 16 },
  // Label cell se chauda hai — absolute taaki agle cells ko dhakka na de
  axisText: { position: 'absolute', left: 0, top: 2, width: 40, fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted },

  legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: theme.spacing.sm },
  legendSwatch: { width: 14, height: 10, borderRadius: 3 },
  legendText: { fontSize: 11, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, marginHorizontal: 2 },
});
