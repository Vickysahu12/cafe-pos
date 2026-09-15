// app/(admin)/menu/_layout.tsx
// USE CASE: Stack navigator nested inside the Menu tab — index (categories) →
//           [categoryId]/products → [categoryId]/create-product, with back-navigation
//           working correctly while staying inside the Menu tab.
// CONNECTED TO: index.tsx, [categoryId]/products.tsx, [categoryId]/create-product.tsx

import { Stack } from 'expo-router';

export default function MenuLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}