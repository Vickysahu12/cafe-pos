import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { rateLimiter } from "./middleware/rate-limiter";
import { errorHandler } from "./middleware/error-handler";
import authRoutes from "./modules/auth/auth.routes";
import menuRoutes from "./modules/menu/menu.routes";
import ordersRoutes from "./modules/orders/orders.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import tablesRoutes from "./modules/tables/tables.routes";
import organizationRoutes from "./modules/organization/organization.routes";
import auditRoutes from "./modules/audit/audit.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import publicMenuRoutes from "./modules/public-menu/public-menu.routes";
import reviewsRoutes from "./modules/reviews/reviews.routes"; // ADDED (2026-10-05): Review Booster

const app = express();

// Render (aur zyaadatar hosts) reverse proxy ke peeche hote hain — isse na
// lagaya jaye to rate-limiter aur req.ip sab requests ko proxy ke IP se aata
// hua maan lete hain, matlab poora cafe ek hi "IP" ban jaata aur ek user ka
// abuse baaki sabko bhi block kar sakta
app.set("trust proxy", 1);

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Origin header sirf browsers bhejte hain — mobile app (fetch/axios se
      // native call) aur server-to-server requests mein ye undefined hota
      // hai, unhe origin-check se exempt rakhna zaroori hai
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    // Cookies ab kahin use nahi ho rahi (refresh token body mein jaata hai),
    // isliye credentials: true ki zaroorat nahi
    credentials: false,
  })
);
app.use(express.json());
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(rateLimiter);

app.get("/health", (req, res) => {
  res.json({ success: true, message: "Server is healthy", data: null, error: null });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/menu", menuRoutes);
app.use("/api/v1/orders", ordersRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/tables", tablesRoutes);
app.use("/api/v1/organization", organizationRoutes);
app.use("/api/v1/audit", auditRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/public", publicMenuRoutes);
app.use("/api/v1/reviews", reviewsRoutes); // ADDED (2026-10-05): Owner/Manager only

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", data: null, error: null });
});

app.use(errorHandler);

export default app;