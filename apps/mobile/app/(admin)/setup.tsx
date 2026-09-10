// app/(admin)/setup.tsx
// USE CASE: First-time Owner/Manager onboarding checklist. Spacing rebalanced —
//           breathing room WITHIN related groups (title→subtitle→progress), but tighter
//           connection BETWEEN sections (header→checklist) to avoid a disconnected void.
// CONNECTED TO: menu.api.ts, auth.api.ts, tables.api.ts (checks setup completion status).

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronRight, Check, UtensilsCrossed, UserPlus, Armchair, Clock, ArrowRight } from 'lucide-react-native';
import { menuApi } from '../../features/menu/menu.api';
import { authApi } from '../../features/auth/auth.api';
import { tablesApi } from '../../features/tables/tables.api';
import { theme } from '../../theme';

interface ChecklistState {
  menuCount: number;
  staffCount: number;
  tableCount: number;
  loading: boolean;
}

export default function SetupScreen() {
  const router = useRouter();
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

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [loadStatus])
  );

  const doneCount = [state.menuCount > 0, state.staffCount > 0, state.tableCount > 0].filter(Boolean).length;
  const allDone = doneCount === 3;

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
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerBlock}>
          <View style={styles.blobPrimary} />
          <View style={styles.blobSuccess} />

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>SETUP</Text>
            </View>
            {!allDone && (
              <View style={styles.timeChip}>
                <Clock size={12} color={theme.colors.textSecondary} />
                <Text style={styles.timeChipText}>~5 min</Text>
              </View>
            )}
          </View>

          <Text style={styles.title}>
            {allDone ? "You're all set! 🎉" : "Let's get your\ncafé ready!"}
          </Text>
          <Text style={styles.subtitle}>
            {allDone
              ? 'Your outlet is fully configured and ready to start taking orders.'
              : 'A few quick steps to set up your outlet, manage your team, and start taking orders.'}
          </Text>

          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(doneCount / 3) * 100}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{doneCount}/3</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>SETUP STEPS</Text>

        <View style={styles.checklistGroup}>
          <ChecklistItem
            done={state.menuCount > 0}
            icon={UtensilsCrossed}
            iconBg={theme.colors.successLight}
            iconColor={theme.colors.success}
            title="Add your menu"
            description={
              state.menuCount > 0
                ? `${state.menuCount} categor${state.menuCount === 1 ? 'y' : 'ies'} added`
                : 'Add categories and products'
            }
            onPress={() => router.push('/(admin)/menu/categories')}
          />
          <ChecklistItem
            done={state.staffCount > 0}
            icon={UserPlus}
            iconBg={theme.colors.warningLight}
            iconColor={theme.colors.warning}
            title="Add your staff"
            description={
              state.staffCount > 0
                ? `${state.staffCount} staff member${state.staffCount === 1 ? '' : 's'} added`
                : 'Add Cashier and Chef accounts'
            }
            onPress={() => router.push('/(admin)/staff')}
          />
          <ChecklistItem
            done={state.tableCount > 0}
            icon={Armchair}
            iconBg={theme.colors.primaryLight}
            iconColor={theme.colors.primary}
            title="Add your tables"
            description={
              state.tableCount > 0 ? `${state.tableCount} table${state.tableCount === 1 ? '' : 's'} added` : 'For dine-in orders'
            }
            onPress={() => router.push('/(admin)/tables')}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.dashboardButton, pressed && styles.dashboardButtonPressed]}
          onPress={() => router.replace('/(admin)/dashboard')}
        >
          <Text style={styles.dashboardButtonText}>{allDone ? 'Go to Dashboard' : 'Continue to Dashboard'}</Text>
          <ArrowRight size={18} color={theme.colors.white} />
        </Pressable>
        {!allDone && <Text style={styles.skipNote}>You can always finish setup later from the Dashboard</Text>}
      </View>
    </SafeAreaView>
  );
}

function ChecklistItem({
  done,
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  onPress,
}: {
  done: boolean;
  icon: React.ComponentType<{ size: number; color: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.item, done && styles.itemDone, pressed && styles.itemPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
        <Icon size={24} color={iconColor} />
      </View>
      <View style={styles.itemTextWrap}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDescription} numberOfLines={1}>{description}</Text>
      </View>
      {done ? (
        <View style={styles.checkBadge}>
          <Check size={14} color={theme.colors.white} strokeWidth={3} />
        </View>
      ) : (
        <ChevronRight size={20} color={theme.colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollArea: { flex: 1 },
  scrollContent: { paddingBottom: theme.spacing.xl },

  headerBlock: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,       // tightened — was xl, was causing the void below
    overflow: 'hidden',
    position: 'relative',
  },
  blobPrimary: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: theme.colors.primaryLight,
    opacity: 0.5,
  },
  blobSuccess: {
    position: 'absolute',
    top: 20,
    right: 60,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: theme.colors.successLight,
    opacity: 0.6,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
  badge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
  },
  badgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.white, letterSpacing: 0.6 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  timeChipText: { fontSize: 11, fontWeight: theme.typography.weight.medium, color: theme.colors.textSecondary },
  title: {
    fontSize: 30,
    fontFamily: theme.typography.fontFamilyDisplay,
    color: theme.colors.textPrimary,
    lineHeight: 38,
    marginBottom: theme.spacing.md,
  },
  subtitle: {
    fontSize: theme.typography.size.base,
    color: theme.colors.textSecondary,
    lineHeight: 23,
    marginBottom: theme.spacing.xl,         // tightened slightly — was xxl
    maxWidth: '92%',
  },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: theme.radius.full },
  progressLabel: { fontSize: theme.typography.size.sm, fontWeight: theme.typography.weight.bold, color: theme.colors.textPrimary },

  sectionLabel: {
    fontSize: 12,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    marginHorizontal: theme.spacing.xl,
    marginTop: theme.spacing.lg,           // tightened — was xxl, this is what caused the void
    marginBottom: theme.spacing.md,
  },
  checklistGroup: { paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemDone: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successLight,
    shadowOpacity: 0,
    elevation: 0,
  },
  itemPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  itemTextWrap: { flex: 1, marginRight: theme.spacing.sm }, // gap added before chevron/check — fixes the text-touching-arrow issue
  itemTitle: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  itemDescription: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, marginTop: 3 },
  checkBadge: {
    width: 26,
    height: 26,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
  },

  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  dashboardButton: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    height: 54,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  dashboardButtonPressed: { opacity: 0.9 },
  dashboardButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
  skipNote: {
    fontSize: theme.typography.size.xs,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
});