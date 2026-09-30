// components/ui/VegMark.tsx
// USE CASE (2026-09-30): India ka standard FSSAI veg/non-veg symbol — square border
// ke andar green dot (veg) ya brown triangle (non-veg). Har Indian food app
// (Swiggy, Zomato, Petpooja) yahi use karta hai; customers aur staff isse turant
// pehchante hain. Pehle billing pe sirf "Veg"/"Non-Veg" text likha aata tha.
// CONNECTED TO: billing.tsx, products.tsx, KDS cards — jahan bhi product dikhe.

import { View, StyleSheet } from 'react-native';

const VEG = '#16A34A';
const NON_VEG = '#92400E';

export function VegMark({ isVeg, size = 14 }: { isVeg: boolean; size?: number }) {
  const color = isVeg ? VEG : NON_VEG;
  const inner = Math.round(size * 0.45);
  return (
    <View
      style={[styles.box, { width: size, height: size, borderColor: color }]}
      accessibilityLabel={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
    >
      {isVeg ? (
        <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: color }} />
      ) : (
        // CSS-border triangle (upar ki taraf)
        <View
          style={{
            width: 0, height: 0,
            borderLeftWidth: inner / 2 + 1, borderRightWidth: inner / 2 + 1, borderBottomWidth: inner,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1.5, borderRadius: 3, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
});
