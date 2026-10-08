// app/(admin)/inventory/[id].tsx
// USE CASE: Placeholder screen for InventoryDetail. Replace with real UI when this screen is built.

import { View, Text, StyleSheet } from 'react-native';

export default function InventoryDetailScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>InventoryDetail - coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, fontFamily: 'Geist_400Regular', color: '#6B655C' },
});
