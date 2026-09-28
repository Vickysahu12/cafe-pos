// app/(admin)/orders/[id].tsx
// Owner/Manager opening an order from Dashboard or the Orders list. The Order Detail
// screen (items, Collect Payment, Serve) is the same one the Cashier uses — Owner and
// Manager are allowed to bill/serve too — so we re-use it instead of duplicating it.
// It reads `id` via useLocalSearchParams, which works under any route group.
export { default } from '../../(cashier)/orders/[id]';