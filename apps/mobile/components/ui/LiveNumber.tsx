// components/ui/LiveNumber.tsx
// ADDED (2026-10-08): UI REDESIGN — live badalne wala number (aaj ki sales, orders).
// USE CASE: Screen khulne pe number SEEDHA dikhta hai (koi 0→value ginti nahi — dashboard
// din mein dasiyon baar khulta hai, har baar ginti dekhna irritating hai). Lekin jab value
// LIVE badle (naya order/payment socket se aaya) to number halka sa neeche se upar aata hai
// — "kuch naya hua" ka signal (state indication), 220ms ease-out.
// Reduce motion: sirf fade, koi movement nahi.
//
// FIX (2026-10-08): Reanimated (Keyframe) → core Animated native driver (Expo Go crash, dekho PressScale).

import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type TextStyle } from 'react-native';
import { useReduceMotion } from './PressScale';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export function LiveNumber({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const reduced = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current; // 1 = rest
  const prev = useRef(text);

  useEffect(() => {
    if (prev.current === text) return; // pehli render / same value → koi animation nahi
    prev.current = text;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 220, easing: EASE_OUT, useNativeDriver: true }).start();
  }, [text, v]);

  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 8, 0] });

  return (
    <Animated.Text style={[style, { opacity, transform: [{ translateY }] }]} accessibilityLiveRegion="polite">
      {text}
    </Animated.Text>
  );
}
