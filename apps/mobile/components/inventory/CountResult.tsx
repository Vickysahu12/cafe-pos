// components/inventory/CountResult.tsx
// ADDED (2026-10-09): Stock SOP — stock count ka nateeja (variance). Do jagah same dikhta hai:
// count save karne ke turant baad (inventory/count.tsx) aur purane counts ki detail
// (inventory/count-detail.tsx). Sabse bada nuksaan upar (backend already sort karta hai).
//  - Upar bada number: kitne ₹ ka maal GAYAB (missing) — yahi owner ka asli sawaal hai
//  - Farq wale items pehle, "matched" wale neeche ek line mein (lambi list nahi)
// CONNECTED TO: features/inventory/inventory.api.ts (StockCountResult), lib/units.ts

import { View, Text, StyleSheet } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import type { StockCountResult } from '../../features/inventory/inventory.api';
import { formatINR } from '../../lib/format';
import { formatQty } from '../../lib/units';
import { theme } from '../../theme';
import { ui } from '../../theme/ui';

const NUM = { fontVariant: ['tabular-nums' as const] };

export function CountResult({ result }: { result: StockCountResult }) {
  const changed = result.lines.filter((l) => l.variance !== 0);
  const matched = result.lines.filter((l) => l.variance === 0);
  const missing = Math.abs(result.missingValue);
  const hasMoney = result.lines.some((l) => l.varianceValue !== 0);

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={[styles.hero, missing > 0 ? styles.heroBad : styles.heroGood]}>
        {changed.length === 0 ? (
          <>
            <CheckCircle2 size={22} color={theme.colors.success} />
            <Text style={[styles.heroTitle, { color: theme.colors.success }]}>Everything matches</Text>
            <Text style={styles.heroSub}>All {result.itemsCounted} counted item{result.itemsCounted === 1 ? '' : 's'} match the system.</Text>
          </>
        ) : (
          <>
            <Text style={styles.heroLabel}>{missing > 0 ? 'Missing stock' : 'Difference found'}</Text>
            <Text style={[styles.heroValue, { color: missing > 0 ? theme.colors.danger : theme.colors.textPrimary }]}>
              {hasMoney ? formatINR(missing) : `${changed.length} item${changed.length === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.heroSub}>
              {changed.length} of {result.itemsCounted} item{result.itemsCounted === 1 ? '' : 's'} didn't match
              {result.extraValue > 0 ? ` · ${formatINR(result.extraValue)} extra found` : ''}
              {!hasMoney ? '. Add cost per unit to see this in ₹.' : '.'}
            </Text>
          </>
        )}
      </View>

      {changed.length > 0 && (
        <View style={styles.card}>
          {changed.map((l, i) => {
            const down = l.variance < 0;
            const color = down ? theme.colors.danger : theme.colors.success;
            return (
              <View key={l.inventoryItemId} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{l.name}</Text>
                  <Text style={styles.sub}>
                    System {formatQty(l.expected, l.unit)} · counted {formatQty(l.actual, l.unit)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.delta, { color }]}>
                    {down ? '' : '+'}
                    {formatQty(l.variance, l.unit)}
                  </Text>
                  {l.varianceValue !== 0 && (
                    <Text style={[styles.value, { color }]}>
                      {down ? '−' : '+'}
                      {formatINR(Math.abs(l.varianceValue))}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      {matched.length > 0 && changed.length > 0 && (
        <Text style={styles.matched}>
          Matched: {matched.map((m) => m.name).slice(0, 6).join(', ')}
          {matched.length > 6 ? ` and ${matched.length - 6} more` : ''}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: 4 },
  heroBad: { backgroundColor: theme.colors.dangerLight },
  heroGood: { backgroundColor: theme.colors.successLight },
  heroLabel: { fontSize: 13, fontFamily: theme.typography.font.medium, color: theme.colors.textSecondary },
  heroValue: { fontSize: 32, lineHeight: 40, fontFamily: theme.typography.font.semibold, ...NUM },
  heroTitle: { fontSize: 20, fontFamily: theme.typography.font.semibold, marginTop: 4 },
  heroSub: { fontSize: 13, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, lineHeight: 18, ...NUM },
  card: { ...ui.card, paddingHorizontal: theme.spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  name: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, color: theme.colors.textPrimary },
  sub: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textSecondary, marginTop: 2, ...NUM },
  delta: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.semibold, ...NUM },
  value: { fontSize: 12, fontFamily: theme.typography.font.medium, marginTop: 2, ...NUM },
  matched: { fontSize: 12, fontFamily: theme.typography.font.regular, color: theme.colors.textMuted, lineHeight: 17 },
});
