// app/(cashier)/orders.tsx
// Cashier's Orders tab — the shared live list. No back arrow: it's a tab root.
import { OrdersListScreen } from '../../components/orders/OrdersListScreen';

export default function CashierOrdersScreen() {
  return <OrdersListScreen detailBasePath="/(cashier)/orders" />;
}