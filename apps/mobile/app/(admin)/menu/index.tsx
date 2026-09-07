// app/(admin)/menu/index.tsx
// USE CASE: Placeholder screen for MenuList. Replace with real UI when this screen is built.

import { View, Text, StyleSheet } from 'react-native';

export default function MenuListScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>MenuList - coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#6B7280' },
});
