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

// FIX (2026-10-12): pehle koi bhi bhatka hua promise rejection Node 20 ko BINA LOG ke band kar deta tha
// (Render restart karta, par pata hi nahi chalta kyun). Ab log hota hai. Rejection pe process zinda
// rakhte hain (ek request ka bug poora server na giraye); uncaught exception pe state bharosemand nahi,
// isliye log + graceful shutdown (Render naya process chala deta hai).
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: reason instanceof Error ? reason.stack : String(reason) });
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception — shutting down", { stack: err.stack });
  shutdown();
});