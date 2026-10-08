// components/legal/LegalPageLayout.tsx
// Moved from components/admin/legal/ — now shared between the pre-login register
// screen and the logged-in Settings screen, so it can no longer assume an admin
// context. router.back() still works correctly from either entry point.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { theme } from '../theme';
import { ui } from '../theme/ui'; // UI REDESIGN (2026-10-08): shared header/back button
import { LegalSection, LAST_UPDATED } from './content';

const ACCENT = '#2B1F14';

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
        <View style={{ width: 40 }} />
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
  header: { ...ui.headerBar },
  backBtn: { ...ui.iconButton },
  headerTitle: { ...ui.headerTitle },

  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  lastUpdated: {
    fontSize: 12, fontFamily: theme.typography.font.regular,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },

  section: { marginBottom: theme.spacing.xl },
  sectionTitle: {
    fontSize: theme.typography.size.base,
    fontFamily: theme.typography.font.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  paragraph: {
    fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },

  bulletList: { marginTop: 2 },
  bulletRow: { flexDirection: 'row', marginBottom: 6, paddingRight: theme.spacing.sm },
  bulletDot: { fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular, color: ACCENT, marginRight: 8, lineHeight: 20 },
  bulletText: {
    flex: 1,
    fontSize: theme.typography.size.sm, fontFamily: theme.typography.font.regular,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },

  footerNote: {
    fontSize: 11, fontFamily: theme.typography.font.regular,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.lg,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});