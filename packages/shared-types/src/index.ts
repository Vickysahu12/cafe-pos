export * from "./user.types";
export * from "./order.types";


// Yeh shared-types vs shared-schemas ka farak samajh lo, kaam aayega aage:

// shared-schemas (Zod) → runtime validation ke liye — jab data backend mein aata hai (request body), usko check karta hai valid hai ya nahi
// shared-types (plain TS) → sirf compile-time type safety ke liye — jaise Socket.io event ka shape, ya JWT payload ka shape, jahan validation ki zaroorat nahi (yeh data khud humara backend generate karta hai, external input nahi)