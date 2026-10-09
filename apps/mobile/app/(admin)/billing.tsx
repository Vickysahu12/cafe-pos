// app/(admin)/billing.tsx
// ADDED (2026-10-09): Owner/Manager ka "Bill" tab — chhote cafe mein owner khud counter pe bill
// karta hai. Cashier wali screen hi reuse (duplicate code nahi); navigation useFlowBase() se
// admin group mein hi rehta hai (lib/use-flow-base.ts).
export { default } from '../(cashier)/billing';
