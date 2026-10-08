// components/chef/KdsOrderCard.tsx
// USE CASE: Kitchen Display ka ek order card — items, har item ka Start → Ready, aur
// sab ready hone pe "Mark order ready".
//
// UI REDESIGN (2026-10-08) — KITCHEN DARK + "2 metre se padho":
//  - Text bada: order # 22px, items 16px (pehle 13px), qty roast-gold, note amber 13px (pehle 10px)
//  - Buttons bade: Start/Ready 40px pill (pehle ~24px — geele/tel wale haathon se miss hota tha),
//    ready = 32px hara ✓, footer "Mark order ready" 48px
//  - Urgency (8 min amber, 15 min red): time chip + card ka border colour. Left colour-bar
//    hataya (template-jaisa pattern; pura card border zyada saaf dikhta hai)
//  - Customer naam # ke saath (phone kitchen ko kabhi nahi aata)
//  - Dark palette: theme/brand.ts → `kds`

import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Coffee, ShoppingBag, Truck, Check, Clock } from 'lucide-react-native';
import { KdsOrder, OrderItemResponse } from '../../features/orders/orders.api';
import { kds, font } from '../../theme/brand';
import { PressScale } from '../ui/PressScale';

const TYPE_ICON: Record<KdsOrder['orderType'], React.ComponentType<{ size: number; color: string }>> = {
  DINE_IN: Coffee,
  TAKEAWAY: ShoppingBag,
  DELIVERY: Truck,
};

const TYPE_LABEL: Record<KdsOrder['orderType'], string> = { DINE_IN: 'Dine-in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };

const ITEM_STATUS_FLOW: OrderItemResponse['status'][] = ['PENDING', 'PREPARING', 'READY'];

interface KdsOrderCardProps {
  order: KdsOrder;
  elapsedMinutes: number;
  onItemStatusChange: (itemId: string, nextStatus: OrderItemResponse['status']) => void;
  onMarkOrderReady: () => void;
  updatingItemId: string | null;
}

export function KdsOrderCard({ order, elapsedMinutes, onItemStatusChange, onMarkOrderReady, updatingItemId }: KdsOrderCardProps) {
  const urgency = elapsedMinutes >= 15 ? 'red' : elapsedMinutes >= 8 ? 'amber' : 'normal';
  const TypeIcon = TYPE_ICON[order.orderType];
  const allItemsReady = order.items.every((i) => i.status === 'READY');
  const urgentColor = urgency === 'red' ? kds.red : urgency === 'amber' ? kds.amber : kds.muted;
  const urgentBg = urgency === 'red' ? kds.redBg : urgency === 'amber' ? kds.amberBg : kds.surfaceRaised;

  return (
    <View
      style={[styles.card, urgency !== 'normal' && { borderColor: urgentColor }]}
      accessibilityLabel={`Order ${order.orderNumber}, ${elapsedMinutes} minutes waiting`}
    >
      {/* Header: # + naam | time */}
      <View style={styles.headerRow}>
        <Text style={styles.orderNumber} numberOfLines={1}>
          #{order.orderNumber}
          {!!order.customerName && <Text style={styles.customerName}>  {order.customerName}</Text>}
        </Text>
        <View style={[styles.timeChip, { backgroundColor: urgentBg }]}>
          <Clock size={14} color={urgentColor} />
          <Text style={[styles.timeText, { color: urgentColor }]}>
            {elapsedMinutes > 999 ? '999+' : elapsedMinutes}m
          </Text>
        </View>
      </View>

      <View style={styles.typeRow}>
        <TypeIcon size={15} color={kds.muted} />
        <Text style={styles.typeText} numberOfLines={1}>
          {order.table ? `Table ${order.table.tableNumber} · ` : ''}
          {TYPE_LABEL[order.orderType]}
          {order.cashierId ? '' : ' · QR'}
        </Text>
      </View>

      {/* Items */}
      <View style={styles.itemsList}>
        {order.items.map((item) => {
          const isUpdating = updatingItemId === item.id;
          const nextStatus = ITEM_STATUS_FLOW[ITEM_STATUS_FLOW.indexOf(item.status) + 1];
          const ready = item.status === 'READY';

          return (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemTextWrap}>
                <Text style={[styles.itemName, ready && styles.itemNameDone]} numberOfLines={3}>
                  <Text style={styles.quantityText}>{item.quantity}× </Text>
                  {item.product.name}
                </Text>
                {item.notes ? <Text style={styles.itemNotes}>“{item.notes}”</Text> : null}
              </View>

              {ready ? (
                <View style={styles.readyBadge} accessibilityLabel={`${item.product.name} ready`}>
                  <Check size={18} color={kds.bg} strokeWidth={3} />
                </View>
              ) : (
                <Pressable
                  style={({ pressed }) => [
                    styles.itemButton,
                    item.status === 'PREPARING' && styles.itemButtonPreparing,
                    (pressed || isUpdating) && { opacity: 0.7 },
                  ]}
                  onPress={() => nextStatus && onItemStatusChange(item.id, nextStatus)}
                  disabled={isUpdating}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.status === 'PENDING' ? 'Start' : 'Mark ready'}: ${item.product.name}`}
                >
                  <Text style={[styles.itemButtonText, item.status === 'PREPARING' && styles.itemButtonTextPreparing]}>
                    {item.status === 'PENDING' ? 'Start' : 'Ready'}
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {allItemsReady && (
        <PressScale style={styles.markReadyButton} onPress={onMarkOrderReady} pressedScale={0.98} accessibilityLabel={`Mark order ${order.orderNumber} ready`}>
          <Check size={18} color={kds.bg} strokeWidth={3} />
          <Text style={styles.markReadyText}>Mark order ready</Text>
        </PressScale>
      )}
    </View>
  );
}

const NUM = { fontVariant: ['tabular-nums' as const] };

const styles = StyleSheet.create({
  card: {
    backgroundColor: kds.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: kds.line,
    padding: 14,
  },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  orderNumber: { flex: 1, fontSize: 22, fontFamily: font.bold, color: kds.text, ...NUM },
  customerName: { fontSize: 17, fontFamily: font.semibold, color: kds.muted },
  timeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, height: 30, borderRadius: 15 },
  timeText: { fontSize: 15, fontFamily: font.bold, ...NUM },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 12 },
  typeText: { flex: 1, fontSize: 14, fontFamily: font.medium, color: kds.muted },

  itemsList: { gap: 10, borderTopWidth: 1, borderTopColor: kds.line, paddingTop: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemTextWrap: { flex: 1 },
  itemName: { fontSize: 16, lineHeight: 22, fontFamily: font.semibold, color: kds.text },
  itemNameDone: { color: kds.faint, textDecorationLine: 'line-through' },
  quantityText: { fontFamily: font.bold, color: kds.accent },
  itemNotes: { fontSize: 13, fontFamily: font.medium, color: kds.amber, marginTop: 3 },

  itemButton: {
    minWidth: 76,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: kds.line,
    backgroundColor: kds.surfaceRaised,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemButtonPreparing: { backgroundColor: kds.accent, borderColor: kds.accent },
  itemButtonText: { fontSize: 15, fontFamily: font.semibold, color: kds.text },
  itemButtonTextPreparing: { color: kds.bg },

  readyBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: kds.green, justifyContent: 'center', alignItems: 'center', marginRight: 2 },

  markReadyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    backgroundColor: kds.green,
    marginTop: 14,
  },
  markReadyText: { color: kds.bg, fontSize: 16, fontFamily: font.bold },
});
