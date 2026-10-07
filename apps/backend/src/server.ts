import { env } from "./config/env";
import http from "http";
import app from "./app";
import { logger } from "./config/logger";
import { prisma } from "./config/db";
import { initSocketIO } from "./sockets";
// ADDED (2026-10-06): customer phone numbers 30 din baad delete (DPDP) — har 6 ghante
import { startCustomerDataRetention } from "./modules/orders/customer-data-retention";

// FIX (2026-09-29): pehle yahan `process.env.PORT || 3000` tha jabki env.ts ka
// default "5000" tha — do alag defaults. Ab ek hi source (env.ts, default 3000,
// jo mobile/web configs expect karte hain). Render khud PORT env set karta hai.
const PORT = Number(env.PORT);

const server = http.createServer(app);

initSocketIO(server);

server.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
  startCustomerDataRetention(); // ADDED (2026-10-06)
});

// Render deploy ke waqt purane container ko SIGTERM bhejta hai (naya deploy
// aane par) — isse na sambhala jaye to in-flight orders/requests beech mein
// kat sakti hain. Ye naye connections lena band karta hai, lekin chalu
// requests ko poora hone deta hai (max 10 sec, uske baad force exit).
function shutdown() {
  logger.info("Shutdown signal received, closing server gracefully...");
  server.close(async () => {
    // FIX (2026-09-29): DB connections bhi saaf band karo — Neon pe har deploy ke
    // saath purane connections latke rehte the jab tak timeout na ho
    await prisma.$disconnect().catch(() => {});
    logger.info("Server closed.");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);