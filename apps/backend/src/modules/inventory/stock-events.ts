/**
 * ADDED (2026-10-09): Stock SOP — live update. Order ne stock kaata / cancel ne wapas kiya /
 * purchase-count hua → POS room (Owner, Manager, Cashier) ko `inventory:changed`. Stock screen
 * aur "Stock" tab ka badge bina refresh ke update hote hain. `alerts` = jo items ABHI low/out hue.
 * Kitchen (KDS) room ko nahi — chef ko stock ka shor nahi chahiye.
 * CONNECTED TO: orders.controller.ts, public-menu.controller.ts, inventory.controller.ts.
 * Mobile: features/inventory/useStockAlerts.ts
 */

import { getIO } from "../../sockets";
import type { StockChange } from "./stock.service";

export function emitStockChange(outletId: string, change: StockChange) {
  if (!change.changed) return;
  try {
    getIO().to(`outlet_${outletId}_pos`).emit("inventory:changed", { outletId, alerts: change.alerts });
  } catch {
    // socket server na ho (tests/scripts) to bhi API response na toote
  }
}
