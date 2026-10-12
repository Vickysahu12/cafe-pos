// app/_layout.tsx
// USE CASE: Root navigation layout. Loads custom fonts before rendering any screen,
// and acts as a global auth guard — whenever isAuthenticated flips to false (manual
// logout, or a silently-expired session), this redirects to login no matter which
// screen/group we're currently deep inside.
// CONNECTED TO: All (auth), (cashier), (chef), (admin) groups nest under this.
//
// FIX (2026-10-12):
//  - ROLE GUARD: pehle yahan sirf isAuthenticated check tha. Deep link (billraw://dashboard) ya koi
//    bhi navigation jo `/` skip kare, Cashier ko admin screens dikha deta tha aur DPDP consent screen
//    skip ho jaati thi (data backend rokta tha, screens nahi). Ab galat group ya consent baaki → `/`,
//    jahan index.tsx sahi jagah bhejta hai.
//  - ErrorBoundary: pehle koi bhi render crash release build mein poori app band kar deta tha. Ab
//    "Something went wrong" + Try again (Expo Router ka per-route ErrorBoundary export).

import { useEffect } from 'react';
import { Stack, useRouter, useSegments, type ErrorBoundaryProps } from 'expo-router';
import { View, Text, Pressable } from 'react-native'; // FIX (2026-10-12): ErrorBoundary UI
import { theme } from '../theme';
import {
  useFonts,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
// ADDED (2026-10-08): UI TRIAL — Geist (UI text) + Geist Mono (numbers). Sirf zaroori weights,
// per-weight import taaki saare 18 font files bundle na hon. Load hone se baaki screens nahi
// badalte — sirf jo screen `theme/brand.ts` use karti hai (abhi sirf Dashboard).
import { Geist_400Regular } from '@expo-google-fonts/geist/400Regular';
import { Geist_500Medium } from '@expo-google-fonts/geist/500Medium';
import { Geist_600SemiBold } from '@expo-google-fonts/geist/600SemiBold';
import { Geist_700Bold } from '@expo-google-fonts/geist/700Bold';
import { GeistMono_500Medium } from '@expo-google-fonts/geist-mono/500Medium';
import { GeistMono_700Bold } from '@expo-google-fonts/geist-mono/700Bold';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../features/auth/auth.store';

SplashScreen.preventAutoHideAsync().catch(() => {});

// FIX (2026-10-12): kis group mein kaun ja sakta hai — index.tsx ke role switch jaisa hi
const GROUP_ROLES: Record<string, string[]> = {
  '(admin)': ['OWNER', 'MANAGER'],
  '(cashier)': ['CASHIER'],
  '(chef)': ['CHEF'],
};

// FIX (2026-10-12): crash pe app band hone ki jagah recover screen
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: theme.colors.background }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: 8 }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 24 }}>
        This screen hit an error. Your orders are saved on the server. Tap below to try again.
      </Text>
      {__DEV__ && <Text style={{ fontSize: 12, color: theme.colors.danger, marginBottom: 16 }}>{error.message}</Text>}
      <Pressable
        onPress={retry}
        style={{ height: 48, paddingHorizontal: 28, borderRadius: 12, backgroundColor: theme.colors.primary, justifyContent: 'center' }}
        accessibilityRole="button"
      >
        <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_500Medium,
    GeistMono_700Bold,
  });

  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const user = useAuthStore((s) => s.user); // FIX (2026-10-12): role guard

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
      return;
    }

    // FIX (2026-10-12): galat role ka group, ya consent baaki (null) → index.tsx decide kare
    const allowed = GROUP_ROLES[segments[0] as string];
    if (isAuthenticated && user && allowed) {
      if (!allowed.includes(user.role) || user.consentAcceptedAt === null) {
        router.replace('/');
      }
    }
  }, [fontsLoaded, isLoading, isAuthenticated, user, segments]);

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