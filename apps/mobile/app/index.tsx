// app/index.tsx
// USE CASE: Entry screen — plays branded splash animation, then checks session and redirects
//           to login or the correct role's home. For OWNER/MANAGER, additionally checks
//           whether the outlet has a menu set up yet — if not, sends them to the Setup
//           checklist instead of an empty, discouraging Dashboard.

import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { AnimatedSplash } from '../components/ui/SplashScreen';
import { useAuthStore } from '../features/auth/auth.store';
import { menuApi } from '../features/menu/menu.api';
import { theme } from '../theme';

export default function Index() {
  const { isLoading, isAuthenticated, user, restoreSession } = useAuthStore();
  const [splashDone, setSplashDone] = useState(false);

  // Only relevant for OWNER/MANAGER — null means "not checked yet"
  const [hasMenu, setHasMenu] = useState<boolean | null>(null);
  const [checkingMenu, setCheckingMenu] = useState(false);

  useEffect(() => {
    restoreSession();
  }, []);

  // Once we know the user is an authenticated Owner/Manager, check menu status
  useEffect(() => {
    const isAdminRole = user?.role === 'OWNER' || user?.role === 'MANAGER';
    if (isAuthenticated && isAdminRole && hasMenu === null && !checkingMenu) {
      setCheckingMenu(true);
      menuApi
        .getCategories()
        .then((categories) => setHasMenu(categories.length > 0))
        .catch(() => setHasMenu(true)) // agar check fail ho (network issue), Dashboard hi dikha do — Setup pe atka mat do
        .finally(() => setCheckingMenu(false));
    }
  }, [isAuthenticated, user]);

  if (!splashDone) {
    return <AnimatedSplash onFinish={() => setSplashDone(true)} />;
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated || !user) {
    return <Redirect href="/(auth)/login" />;
  }

  switch (user.role) {
    case 'CASHIER':
      return <Redirect href="/(cashier)/billing" />;
    case 'CHEF':
      return <Redirect href="/(chef)/kds" />;
    case 'OWNER':
    case 'MANAGER':
      // Menu check abhi chal raha hai — thoda wait karo, blank screen dikhao spinner ke saath
      if (hasMenu === null) {
        return (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.surface }}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        );
      }
      return <Redirect href={hasMenu ? '/(admin)/dashboard' : '/(admin)/setup'} />;
    default:
      return <Redirect href="/(auth)/login" />;
  }
}