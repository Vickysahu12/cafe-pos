// lib/delivery-message.ts
// ADDED (2026-10-18): WHATSAPP DELIVERY LINK — delivery boy ko jaane wala WhatsApp message + kholna.
// Message mein sirf delivery ke kaam ka: customer naam/phone (call ke liye), address, Maps pin,
// kitna lena hai (ya "already paid"), aur "Delivered" link. Cafe ka apna WhatsApp bhejta hai —
// koi paid WhatsApp API nahi (₹0).
// Kholna: wa.me (WhatsApp install hai to app, warna browser). Fail → Android share sheet.
// CONNECTED TO: components/delivery/SendToDeliverySheet.tsx, orders/[id].tsx (Resend)

import { Linking, Share } from 'react-native';
import { ORDER_WEB_URL } from './config';
import { formatINR } from './format';
import type { OrderResponse } from '../features/orders/orders.api';

export const deliveryLinkUrl = (token: string) => `${ORDER_WEB_URL}/d/${token}`;

export function buildDeliveryMessage(order: OrderResponse, outletName: string, token: string): string {
  const map =
    order.deliveryLat != null && order.deliveryLng != null
      ? `https://maps.google.com/?q=${order.deliveryLat},${order.deliveryLng}`
      : order.deliveryAddress
        ? `https://maps.google.com/?q=${encodeURIComponent(order.deliveryAddress)}`
        : null;
  const paid = order.paymentStatus === 'PAID';
  return [
    `🛵 Delivery · Order #${order.orderNumber} · ${outletName}`,
    '',
    `👤 ${order.customerName ?? 'Customer'}${order.customerPhone ? ` · ${order.customerPhone}` : ''}`,
    order.deliveryAddress ? `📍 ${order.deliveryAddress}` : null,
    map ? `🗺️ Map: ${map}` : null,
    '',
    paid ? '✅ Already paid. Don’t collect money.' : `💰 Collect ${formatINR(order.netAmount)} (cash or UPI)`,
    '',
    `When delivered, open this and tap Delivered:`,
    deliveryLinkUrl(token),
  ]
    .filter((l) => l !== null)
    .join('\n');
}

/** WhatsApp pe usi number ko message. true = khul gaya, false = share sheet dikhaya */
export async function openWhatsApp(phone10: string, message: string): Promise<boolean> {
  try {
    await Linking.openURL(`https://wa.me/91${phone10}?text=${encodeURIComponent(message)}`);
    return true;
  } catch {
    await Share.share({ message }).catch(() => {});
    return false;
  }
}
