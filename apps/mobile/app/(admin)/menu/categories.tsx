// app/(admin)/menu/categories.tsx
// USE CASE: Placeholder screen for Categories. Replace with real UI when this screen is built.

import { View, Text, StyleSheet } from 'react-native';

export default function CategoriesScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Categories - coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#6B7280' },
});
