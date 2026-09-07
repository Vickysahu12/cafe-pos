// app/(admin)/setup.tsx
// USE CASE: First-time Owner/Manager onboarding checklist — shown instead of Dashboard
//           when the outlet has no menu yet (fresh registration). Prevents new users from
//           landing on an empty, discouraging Dashboard with zero data.
// CONNECTED TO: menu.api.ts, auth.api.ts, tables.api.ts (checks setup completion status).
//               "Go to Dashboard" navigates to (admin)/dashboard once ready or skipped.

import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronRight, Check } from 'lucide-react-native';
import { menuApi } from '../../features/menu/menu.api';
import { authApi } from '../../features/auth/auth.api';
import { tablesApi } from '../../features/tables/tables.api';
import { useAuthStore } from '../../features/auth/auth.store';
import { theme } from '../../theme';

interface ChecklistState {
  menuCount: number;
  staffCount: number;
  tableCount: number;
  loading: boolean;
}

export default function SetupScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState<ChecklistState>({
    menuCount: 0,
    staffCount: 0,
    tableCount: 0,
    loading: true,
  });

  const loadStatus = useCallback(async () => {
    try {
      const [categories, staff, tables] = await Promise.all([
        menuApi.getCategories(),
        authApi.getStaffList(),
        tablesApi.getTables(),
      ]);
      setState({
        menuCount: categories.length,
        staffCount: staff.length,
        tableCount: tables.length,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  // Re-check every time this screen comes back into focus — e.g. after
  // the Owner adds a category and taps back, the checkmark should update
  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus])
  );

  const doneCount = [state.menuCount > 0, state.staffCount > 0, state.tableCount > 0].filter(Boolean).length;

  if (state.loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.emoji}>🎉</Text>
        <Text style={styles.title}>Welcome to BillRaw</Text>
        <Text style={styles.subtitle}>Let's get your cafe ready to take orders</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(doneCount / 3) * 100}%` }]} />
        </View>
        <Text style={styles.progressLabel}>{doneCount} of 3 done</Text>

        <ChecklistItem
          done={state.menuCount > 0}
          title="Add your menu"
          description={
            state.menuCount > 0
              ? `${state.menuCount} categor${state.menuCount === 1 ? 'y' : 'ies'} added`
              : 'Add categories and products to start billing'
          }
          onPress={() => router.push('/(admin)/menu/categories')}
        />
        <ChecklistItem
          done={state.staffCount > 0}
          title="Add your staff"
          description={
            state.staffCount > 0 ? `${state.staffCount} staff member${state.staffCount === 1 ? '' : 's'} added` : 'Add Cashier and Chef accounts'
          }
          onPress={() => router.push('/(admin)/staff')}
        />
        <ChecklistItem
          done={state.tableCount > 0}
          title="Add your tables"
          description={state.tableCount > 0 ? `${state.tableCount} table${state.tableCount === 1 ? '' : 's'} added` : 'For dine-in orders'}
          onPress={() => router.push('/(admin)/tables')}
        />

        <Pressable style={styles.dashboardButton} onPress={() => router.replace('/(admin)/dashboard')}>
          <Text style={styles.dashboardButtonText}>Go to Dashboard</Text>
        </Pressable>
        <Text style={styles.skipNote}>You can always finish setup later from the Dashboard</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ChecklistItem({
  done,
  title,
  description,
  onPress,
}: {
  done: boolean;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.item} onPress={onPress}>
      <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
        {done && <Check size={14} color={theme.colors.white} strokeWidth={3} />}
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDescription}>{description}</Text>
      </View>
      {!done && <ChevronRight size={20} color={theme.colors.textMuted} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: theme.spacing.xl, alignItems: 'center' },
  emoji: { fontSize: 40, marginBottom: theme.spacing.sm },
  title: {
    fontSize: theme.typography.size.xxl,
    fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  subtitle: {
    fontSize: theme.typography.size.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xl,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: theme.spacing.xs,
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: theme.radius.full },
  progressLabel: { fontSize: theme.typography.size.sm, color: theme.colors.textMuted, marginBottom: theme.spacing.xl },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  checkCircleDone: { backgroundColor: theme.colors.success, borderColor: theme.colors.success },
  itemTextWrap: { flex: 1 },
  itemTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  itemDescription: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, marginTop: 2 },
  dashboardButton: {
    width: '100%',
    height: 52,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  dashboardButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
  skipNote: { fontSize: theme.typography.size.xs, color: theme.colors.textMuted, marginTop: theme.spacing.sm, textAlign: 'center' },
});