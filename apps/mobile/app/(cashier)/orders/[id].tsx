// app/(cashier)/orders/[id].tsx
// USE CASE: Placeholder screen for OrderDetail. Replace with real UI when this screen is built.

import { View, Text, StyleSheet } from 'react-native';

export default function OrderDetailScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>OrderDetail - coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { fontSize: 16, color: '#6B7280' },
});
