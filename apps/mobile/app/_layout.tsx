// app/_layout.tsx
// USE CASE: Root navigation layout. Loads custom fonts before rendering any screen.
// CONNECTED TO: All (auth), (cashier), (chef), (admin) groups nest under this.

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import {
  useFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

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
    </Stack>
  );
}