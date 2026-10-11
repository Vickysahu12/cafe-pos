// components/charts/WeekBars.tsx
// ADDED (2026-10-11): Dashboard "This week" card ke 7 bars — har din ki sales. Aaj ka bar roast-gold
// (brand accent), baaki halke espresso. Bar tap = upar us din ka ₹ + orders (default: sabse accha din).
// Plain RN Views (koi library nahi), 40px+ tap area, har bar ka accessibilityLabel.
// CONNECTED TO: app/(admin)/dashboard.tsx (SalesReport.series, 7 din)

import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { brand, font } from '../../theme/brand';
import { haptics } from '../../lib/haptics';
import { weekdayShort, fullDay } from '../../lib/format';

interface Props {
  series: { date: string; revenue: number; orders: number }[];
  formatValue: (n: number) => string;
  height?: number;
}

export function WeekBars({ series, formatValue, height = 96 }: Props) {
  const max = Math.max(1, ...series.map((d) => d.revenue));
  const bestIdx = series.reduce((b, d, i) => (d.revenue > series[b].revenue ? i : b), 0);
  const [selected, setSelected] = useState<number | null>(null);
  const shown = selected ?? bestIdx;
  const s = series[shown];
  const lastIdx = series.length - 1;

  return (
    <View>
      {s && (
        <Text style={styles.readout} numberOfLines={1}>
          {selected === null && s.revenue > 0 ? 'Best day · ' : ''}
          {fullDay(s.date)} · <Text style={styles.readoutStrong}>{formatValue(s.revenue)}</Text> · {s.orders} order{s.orders === 1 ? '' : 's'}
        </Text>
      )}
      <View style={[styles.bars, { height }]}>
        {series.map((d, i) => {
          const isToday = i === lastIdx;
          const active = i === shown;
          const h = d.revenue > 0 ? Math.max(6, (d.revenue / max) * (height - 4)) : 4;
          return (
            <Pressable
              key={d.date}
              style={styles.col}
              onPress={() => { haptics.tap(); setSelected(i); }}
              accessibilityRole="button"
              accessibilityLabel={`${fullDay(d.date)}: ${formatValue(d.revenue)}, ${d.orders} orders`}
            >
              <View
                style={[
                  styles.bar,
                  { height: h },
                  isToday ? styles.barToday : styles.barOther,
                  active && !isToday && styles.barActive,
                  d.revenue === 0 && styles.barEmpty,
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.labels}>
        {series.map((d, i) => (
          <Text key={d.date} style={[styles.label, i === lastIdx && styles.labelToday]}>
            {i === lastIdx ? 'Today' : weekdayShort(d.date)}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { fontSize: 13, fontFamily: font.regular, color: brand.muted, marginBottom: 12, fontVariant: ['tabular-nums'] },
  readoutStrong: { fontFamily: font.semibold, color: brand.ink },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', minHeight: 40 },
  bar: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  barOther: { backgroundColor: 'rgba(43,31,20,0.14)' },
  barActive: { backgroundColor: 'rgba(43,31,20,0.42)' },
  barToday: { backgroundColor: brand.roast },
  barEmpty: { backgroundColor: brand.line },
  labels: { flexDirection: 'row', gap: 8, marginTop: 8 },
  label: { flex: 1, textAlign: 'center', fontSize: 11, fontFamily: font.medium, color: brand.faint },
  labelToday: { color: brand.roastInk, fontFamily: font.semibold },
});
