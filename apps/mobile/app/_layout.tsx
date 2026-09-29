// app/_layout.tsx
// USE CASE: Root navigation layout. Loads custom fonts before rendering any screen,
// and acts as a global auth guard — whenever isAuthenticated flips to false (manual
// logout, or a silently-expired session), this redirects to login no matter which
// screen/group we're currently deep inside.
// CONNECTED TO: All (auth), (cashier), (chef), (admin) groups nest under this.

import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import {
  useFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../features/auth/auth.store';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  // Global auth guard — this is what index.tsx alone can't do, since it only
  // runs its redirect logic when IT is the screen being mounted. This effect
  // lives in the root layout, which is always mounted, so it fires no matter
  // where in the (admin)/(cashier)/(chef) stacks you currently are.
  useEffect(() => {
    if (!fontsLoaded || isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [fontsLoaded, isLoading, isAuthenticated, segments]);

  if (!fontsLoaded) {
    return null; // native splash stays visible until fonts are ready
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(cashier)" />
      <Stack.Screen name="(chef)" />
      <Stack.Screen name="(admin)" />
      {/* FIX (2026-09-30): staff first-login consent (DPDP) — back gesture band, skip na ho */}
      <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
    </Stack>
  );
}