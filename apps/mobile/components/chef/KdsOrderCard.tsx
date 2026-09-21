// components/chef/KdsOrderCard.tsx
// USE CASE: One order card on the KDS board. Ages visually with wait time (per the PRD:
//           yellow at 8 min, red at 15 min) so the kitchen always sees what's falling
//           behind. Each item has its own status cycle button (Pending→Preparing→Ready)
//           since items in one order often finish at different times.
// CONNECTED TO: app/(chef)/kds.tsx. orders.api.ts types.

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Coffee, ShoppingBag, Truck, Check } from 'lucide-react-native';
import { KdsOrder, OrderItemResponse } from '../../features/orders/orders.api';
import { theme } from '../../theme';

const TYPE_ICON: Record<KdsOrder['orderType'], React.ComponentType<{ size: number; color: string }>> = {
  DINE_IN: Coffee,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Truck,
};

const ITEM_STATUS_FLOW: OrderItemResponse['status'][] = ['PENDING', 'PREPARING', 'READY'];

interface KdsOrderCardProps {
  order: KdsOrder;
  elapsedMinutes: number;
  onItemStatusChange: (itemId: string, nextStatus: OrderItemResponse['status']) => void;
  onMarkOrderReady: () => void;
  updatingItemId: string | null;
}

export function KdsOrderCard({ order, elapsedMinutes, onItemStatusChange, onMarkOrderReady, updatingItemId }: KdsOrderCardProps) {
  const urgency = elapsedMinutes >= 15 ? 'red' : elapsedMinutes >= 8 ? 'yellow' : 'normal';
  const TypeIcon = TYPE_ICON[order.orderType];
  const allItemsReady = order.items.every((i) => i.status === 'READY');

  return (
    <View style={[styles.card, urgency === 'yellow' && styles.cardYellow, urgency === 'red' && styles.cardRed]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <TypeIcon size={16} color={theme.colors.textSecondary} />
          <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
          <Text style={styles.orderMeta}>
            {order.table ? `Table ${order.table.tableNumber}` : order.orderType.replace('_', ' ')}
          </Text>
        </View>
        <View style={[styles.timeBadge, urgency === 'yellow' && styles.timeBadgeYellow, urgency === 'red' && styles.timeBadgeRed]}>
          <Text style={[styles.timeBadgeText, urgency !== 'normal' && styles.timeBadgeTextUrgent]}>{elapsedMinutes}m</Text>
        </View>
      </View>

      <View style={styles.itemsList}>
        {order.items.map((item) => {
          const isUpdating = updatingItemId === item.id;
          const nextIndex = ITEM_STATUS_FLOW.indexOf(item.status) + 1;
          const nextStatus = ITEM_STATUS_FLOW[nextIndex];

          return (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemTextWrap}>
                <Text style={styles.itemName}>
                  {item.quantity}× {item.product.name}
                </Text>
                {item.notes && <Text style={styles.itemNotes}>"{item.notes}"</Text>}
              </View>

              {item.status === 'READY' ? (
                <View style={styles.readyBadge}>
                  <Check size={12} color={theme.colors.white} strokeWidth={3} />
                </View>
              ) : (
                <Pressable
                  style={[styles.itemStatusButton, item.status === 'PREPARING' && styles.itemStatusButtonPreparing]}
                  onPress={() => nextStatus && onItemStatusChange(item.id, nextStatus)}
                  disabled={isUpdating}
                >
                  <Text style={[styles.itemStatusText, item.status === 'PREPARING' && styles.itemStatusTextPreparing]}>
                    {item.status === 'PENDING' ? 'Start' : 'Ready'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {allItemsReady && (
        <Pressable style={styles.markReadyButton} onPress={onMarkOrderReady}>
          <Check size={15} color={theme.colors.white} strokeWidth={3} />
          <Text style={styles.markReadyText}>Mark Order Ready</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardYellow: { borderColor: theme.colors.warning, backgroundColor: theme.colors.warningLight },
  cardRed: { borderColor: theme.colors.danger, backgroundColor: theme.colors.dangerLight },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.sm },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  orderNumber: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },
  orderMeta: { fontSize: 12, color: theme.colors.textSecondary, textTransform: 'capitalize' },
  timeBadge: { backgroundColor: theme.colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.radius.full },
  timeBadgeYellow: { backgroundColor: theme.colors.warning },
  timeBadgeRed: { backgroundColor: theme.colors.danger },
  timeBadgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.textSecondary },
  timeBadgeTextUrgent: { color: theme.colors.white },

  itemsList: { gap: theme.spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemTextWrap: { flex: 1 },
  itemName: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  itemNotes: { fontSize: 12, fontWeight: theme.typography.weight.bold, color: theme.colors.warning, marginTop: 2 },

  itemStatusButton: { backgroundColor: theme.colors.background, borderWidth: 1, borderColor: theme.colors.border, paddingHorizontal: theme.spacing.sm, paddingVertical: 6, borderRadius: theme.radius.md, minWidth: 60, alignItems: 'center' },
  itemStatusButtonPreparing: { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.primary },
  itemStatusText: { fontSize: 11, fontWeight: theme.typography.weight.semibold, color: theme.colors.textSecondary },
  itemStatusTextPreparing: { color: theme.colors.primaryDark },
  readyBadge: { width: 24, height: 24, borderRadius: theme.radius.full, backgroundColor: theme.colors.success, justifyContent: 'center', alignItems: 'center' },

  markReadyButton: { flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.success, borderRadius: theme.radius.md, paddingVertical: theme.spacing.sm + 2, marginTop: theme.spacing.md },
  markReadyText: { color: theme.colors.white, fontSize: 13, fontWeight: theme.typography.weight.bold },
});