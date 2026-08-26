import "./config/env"; // validates env vars first — crashes early if something's missing
import http from "http";
import app from "./app";
import { logger } from "./config/logger";

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

server.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT}`);
});

// Socket.io will be attached here in Phase 7 (Orders module),
// once we build the real-time KDS/Cashier sync