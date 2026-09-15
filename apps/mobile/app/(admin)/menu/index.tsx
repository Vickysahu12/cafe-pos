// app/(admin)/menu/categories.tsx
// USE CASE: Menu categories list — Owner/Manager's core menu-management screen. Tapping
//           a category will later navigate into its products (not built yet). "Add
//           Category" opens a bottom-sheet form instead of a full separate screen.
// CONNECTED TO: menu.api.ts. Reached from Setup checklist and (later) Admin nav.

import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronRight, Coffee, Plus, UtensilsCrossed } from 'lucide-react-native';
import { menuApi, Category } from '../../../features/menu/menu.api';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { TextField } from '../../../components/ui/TextField';
import { Button } from '../../../components/ui/Button';
import { theme } from '../../../theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await menuApi.getCategories();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = async () => {
    if (newName.trim().length < 2) {
      setNameError('Category name is too short');
      return;
    }
    setSaving(true);
    try {
      await menuApi.createCategory({ name: newName.trim() });
      setNewName('');
      setModalVisible(false);
      load();
    } catch {
      Alert.alert('Something went wrong', 'Could not create the category. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.headerRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backButton}>
          <ArrowLeft size={20} color={theme.colors.textPrimary} />
        </Pressable>
        <View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>MENU</Text>
          </View>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>Your Menu</Text>
        <Text style={styles.subtitle}>
          {categories.length > 0
            ? `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} · ${categories.reduce((sum, c) => sum + c._count.products, 0)} items`
            : 'Start by adding your first category'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : categories.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconBadge}>
            <UtensilsCrossed size={28} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>No categories yet</Text>
          <Text style={styles.emptyText}>Categories help organize your menu — like Coffee, Snacks, or Desserts.</Text>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
  style={({ pressed }) => [styles.categoryCard, pressed && styles.cardPressed]}
  onPress={() => router.push({ pathname: '/(admin)/menu/[categoryId]/products', params: { categoryId: item.id, categoryName: item.name } })}
>
              <View style={styles.categoryIconBadge}>
                <Coffee size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.categoryTextWrap}>
                <Text style={styles.categoryName}>{item.name}</Text>
                <Text style={styles.categoryCount}>
                  {item._count.products} item{item._count.products === 1 ? '' : 's'}
                </Text>
              </View>
              <ChevronRight size={20} color={theme.colors.textMuted} />
            </Pressable>
          )}
        />
      )}

      <View style={styles.footer}>
        <Pressable style={styles.addButton} onPress={() => setModalVisible(true)}>
          <Plus size={18} color={theme.colors.white} />
          <Text style={styles.addButtonText}>Add Category</Text>
        </Pressable>
      </View>

      <BottomSheet visible={modalVisible} onClose={() => setModalVisible(false)} title="Add Category">
        <TextField
          label="Category Name"
          placeholder="e.g. Coffee, Snacks, Desserts"
          value={newName}
          onChangeText={(v) => {
            setNewName(v);
            if (nameError) setNameError(undefined);
          }}
          error={nameError}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Button title="Add Category" onPress={handleAdd} loading={saving} />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
  },
  backButton: { width: 32, height: 32, justifyContent: 'center' },
  badge: { backgroundColor: theme.colors.primary, paddingHorizontal: theme.spacing.md, paddingVertical: 5, borderRadius: theme.radius.full },
  badgeText: { fontSize: 11, fontWeight: theme.typography.weight.bold, color: theme.colors.white, letterSpacing: 0.6 },
  titleBlock: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.lg, paddingBottom: theme.spacing.md },
  title: { fontSize: 28, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: theme.typography.size.base, color: theme.colors.textSecondary },
  listContent: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.sm, gap: theme.spacing.md, paddingBottom: theme.spacing.xl },
  categoryCard: {
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
  cardPressed: { opacity: 0.85 },
  categoryIconBadge: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  categoryTextWrap: { flex: 1, marginRight: theme.spacing.sm },
  categoryName: { fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary },
  categoryCount: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, marginTop: 2 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: theme.spacing.xxl },
  emptyIconBadge: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: { fontSize: theme.typography.size.lg, fontWeight: theme.typography.weight.semibold, color: theme.colors.textPrimary, marginBottom: 6 },
  emptyText: { fontSize: theme.typography.size.sm, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  footer: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  addButton: {
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
  addButtonText: { color: theme.colors.white, fontSize: theme.typography.size.base, fontWeight: theme.typography.weight.semibold },
});