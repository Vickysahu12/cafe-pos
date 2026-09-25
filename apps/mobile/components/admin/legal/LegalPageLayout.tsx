// app/(admin)/legal/LegalPageLayout.tsx
// Shared scaffold for Privacy Policy & Terms screens — reuses the white header /
// blue-accent style introduced in settings.tsx, so both legal screens feel consistent
// with the rest of the admin section without duplicating styling code twice.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { theme } from '../../../theme';
import { LegalSection, LAST_UPDATED } from './content';

const ACCENT = '#2563EB';

interface Props {
  title: string;
  sections: LegalSection[];
}

export default function LegalPageLayout({ title, sections }: Props) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <ArrowLeft size={19} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lastUpdated}>Last updated: {LAST_UPDATED}</Text>

        {sections.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {section.paragraphs?.map((p, i) => (
              <Text key={`p-${i}`} style={styles.paragraph}>
                {p}
              </Text>
            ))}

            {section.bullets && (
              <View style={styles.bulletList}>
                {section.bullets.map((b, i) => (
                  <View key={`b-${i}`} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>{'\u2022'}</Text>
                    <Text style={styles.bulletText}>{b}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={styles.footerNote}>
          This document is provided for transparency about how the app works. For legal
          advice specific to your business, please consult a qualified professional.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: theme.typography.size.lg,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
  },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  lastUpdated: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },

  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontSize: theme.typography.size.base,
    fontWeight: theme.typography.weight.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  paragraph: {
    fontSize: theme.typography.size.sm,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },

  bulletList: { marginTop: 2 },
  bulletRow: { flexDirection: 'row', marginBottom: 6, paddingRight: theme.spacing.sm },
  bulletDot: { fontSize: theme.typography.size.sm, color: ACCENT, marginRight: 8, lineHeight: 20 },
  bulletText: {
    flex: 1,
    fontSize: theme.typography.size.sm,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },

  footerNote: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.lg,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});