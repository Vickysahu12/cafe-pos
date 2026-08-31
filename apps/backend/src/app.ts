import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import { rateLimiter, authRateLimiter } from "./middleware/rate-limiter";
import { errorHandler } from "./middleware/error-handler";
import authRoutes from "./modules/auth/auth.routes";
import menuRoutes from "./modules/menu/menu.routes"; // ← yeh line add karo
import ordersRoutes from "./modules/orders/orders.routes"; // ← add karo
import inventoryRoutes from "./modules/inventory/inventory.routes"; // ← add karo
import tablesRoutes from "./modules/tables/tables.routes"; // ← add karo
import organizationRoutes from "./modules/organization/organization.routes"; // ← add
import auditRoutes from "./modules/audit/audit.routes"; // ← add
import analyticsRoutes from "./modules/analytics/analytics.routes"; // ← add
import publicMenuRoutes from "./modules/public-menu/public-menu.routes"; // ← add

const app = express();

// Security & core middleware
app.use(helmet());
app.use(
  cors({
    origin: true, // TODO: restrict to actual mobile/web client origins before production
    credentials: true, // required so HttpOnly refresh-token cookie works cross-origin
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(rateLimiter);

// Health check — useful to confirm server + DB are up
app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is healthy", data: null, error: null });
});

// Routes
app.use("/api/v1/auth/login", authRateLimiter); // stricter limit only on login
app.use("/api/v1/auth", authRoutes);

app.use("/api/v1/menu", menuRoutes); // ← yeh line add karo
app.use("/api/v1/orders", ordersRoutes); // ← add karo, auth/menu ke neeche

app.use("/api/v1/inventory", inventoryRoutes); // ← add karo
app.use("/api/v1/tables", tablesRoutes); // ← add karo

app.use("/api/v1/organization", organizationRoutes); // ← add
app.use("/api/v1/audit", auditRoutes); // ← add

app.use("/api/v1/analytics", analyticsRoutes); // ← add
app.use("/api/v1/public", publicMenuRoutes); // ← add

// 404 handler — must come after all routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", data: null, error: null });
});

// Global error handler — must be last
app.use(errorHandler);

export default app;