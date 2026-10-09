import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // FIX (2026-10-09): Prisma ka default interactive-transaction timeout 5s hai. Neon (free plan)
    // idle hone pe DB "so" jaata hai — jaagne mein kuch second lagte hain, upar se order banane ki
    // transaction mein ~5 queries hain (products, table, counter, order, table status). Smoke test
    // mein 5211ms pe "Transaction already closed" aaya → order FAIL. Production mein bhi subah ka
    // pehla order fail ho sakta tha. Ab: connection ke liye 10s wait, transaction ko 15s.
    // Normal din mein orders milliseconds mein hi khatam hote hain — yeh sirf safety margin hai.
    transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}