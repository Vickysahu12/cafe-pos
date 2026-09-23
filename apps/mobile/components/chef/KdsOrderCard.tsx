// components/chef/KdsOrderCard.tsx
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Coffee, ShoppingBag, Truck, Check, ArrowRight, Clock } from 'lucide-react-native';
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
    <View style={styles.card}>
      {/* Left accent border bar based on urgency */}
      <View
        style={[
          styles.accentBar,
          urgency === 'yellow' && styles.accentYellow,
          urgency === 'red' && styles.accentRed,
        ]}
      />

      <View style={styles.cardContent}>
        {/* Top Header Row: Time badge left, Type pill right */}
        <View style={styles.headerRow}>
          <View style={[styles.timeBadge, urgency === 'yellow' && styles.timeBadgeYellow, urgency === 'red' && styles.timeBadgeRed]}>
            <Clock size={11} color={urgency !== 'normal' ? '#D32F2F' : theme.colors.textSecondary} />
            <Text style={[styles.timeBadgeText, urgency !== 'normal' && styles.timeBadgeTextUrgent]}>
              {elapsedMinutes > 999 ? '999+m' : `${elapsedMinutes}m`}
            </Text>
          </View>

          <View style={styles.typeBadge}>
            <TypeIcon size={12} color={theme.colors.textSecondary} />
            <Text style={styles.typeBadgeText} numberOfLines={1}>
              {order.table ? `Table ${order.table.tableNumber}` : order.orderType.replace('_', ' ')}
            </Text>
          </View>
        </View>

        {/* Order Number */}
        <Text style={styles.orderNumber}>#{order.orderNumber}</Text>

        <Text style={styles.subTypeLabel}>
          <TypeIcon size={12} color={theme.colors.textMuted} /> {order.orderType.replace('_', ' ')}
        </Text>

        {/* Items List */}
        <View style={styles.itemsList}>
          {order.items.map((item) => {
            const isUpdating = updatingItemId === item.id;
            const nextIndex = ITEM_STATUS_FLOW.indexOf(item.status) + 1;
            const nextStatus = ITEM_STATUS_FLOW[nextIndex];

            return (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemTextWrap}>
                  <Text style={styles.itemName} numberOfLines={2}>
                    <Text style={styles.quantityText}>{item.quantity}×</Text> {item.product.name}
                  </Text>
                  {item.notes && <Text style={styles.itemNotes}>"{item.notes}"</Text>}
                </View>

                {item.status === 'READY' ? (
                  <View style={styles.readyBadge}>
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : (
                  <Pressable
                    style={[
                      styles.itemStatusButton,
                      item.status === 'PREPARING' && styles.itemStatusButtonPreparing,
                    ]}
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

        {/* Footer Action */}
        {allItemsReady && (
          <Pressable style={styles.markReadyButton} onPress={onMarkOrderReady}>
            <View style={styles.markReadyLeft}>
              <View style={styles.checkIconCircle}>
                <Check size={10} color={theme.colors.success} strokeWidth={3} />
              </View>
              <Text style={styles.markReadyText}>Mark Order Ready</Text>
            </View>
            <ArrowRight size={13} color={theme.colors.primaryDark || '#0A3A2A'} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  accentBar: {
    width: 4,
    backgroundColor: theme.colors.success || '#2E7D32',
  },
  accentYellow: {
    backgroundColor: theme.colors.warning || '#ED6C02',
  },
  accentRed: {
    backgroundColor: theme.colors.danger || '#D32F2F',
  },

  cardContent: {
    flex: 1,
    padding: 12,
  },

  headerRow: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  timeBadgeYellow: {
    backgroundColor: '#FFF3E0',
  },
  timeBadgeRed: {
    backgroundColor: '#FFEBEE',
  },
  timeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  timeBadgeTextUrgent: {
    color: '#D32F2F',
  },

  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    maxWidth: '50%',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    textTransform: 'capitalize',
  },

  orderNumber: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginTop: 8,
  },
  subTypeLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
    marginBottom: 10,
  },

  itemsList: {
    gap: 8,
    marginVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    gap: 6,
  },
  itemTextWrap: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  quantityText: {
    fontWeight: '800',
    color: '#1A6B52',
  },
  itemNotes: {
    fontSize: 10,
    color: theme.colors.textMuted,
    marginTop: 1,
    fontStyle: 'italic',
  },

  itemStatusButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#EAEAEA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  itemStatusButtonPreparing: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  itemStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  itemStatusTextPreparing: {
    color: '#FFFFFF',
  },

  readyBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10B981',
    justify: 'center',
    alignItems: 'center',
  },

  markReadyButton: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 12,
  },
  markReadyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkIconCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    justify: 'center',
    alignItems: 'center',
  },
  markReadyText: {
    color: '#0A3A2A',
    fontSize: 11,
    fontWeight: '700',
  },
});