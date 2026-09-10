// components/ui/BottomSheet.tsx
// USE CASE: Reusable slide-up modal sheet for quick "Add" forms (Category, Staff, Table).
//           Avoids needing a full separate screen + navigation for simple single-form actions.
// CONNECTED TO: Used by (admin)/menu/categories.tsx, (admin)/staff.tsx, (admin)/tables.tsx

import { Modal, View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { X } from 'lucide-react-native';
import { theme } from '../../theme';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <X size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 24, 39, 0.5)' },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg + 8,
    borderTopRightRadius: theme.radius.lg + 8,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginBottom: theme.spacing.lg,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: theme.spacing.lg },
  title: { fontSize: theme.typography.size.xl, fontFamily: theme.typography.fontFamilyDisplay, color: theme.colors.textPrimary },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});