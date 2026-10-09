// app/(admin)/orders.tsx
// USE CASE: Owner/Manager's Orders screen, reached from Dashboard → View All.
// Lives in the (admin) group on purpose: pushing into (cashier) dropped the Owner
// into the Cashier's tab bar (Billing / Orders), which is the wrong place for them.
// Same shared list + same live data as the Cashier sees.
import { OrdersListScreen } from '../../components/orders/OrdersListScreen';

export default function AdminOrdersScreen() {
  // UI REDESIGN (2026-10-09): ab Orders TAB hai — back arrow nahi (showBack hataya)
  return <OrdersListScreen detailBasePath="/(admin)/orders" title="Orders" />;
}