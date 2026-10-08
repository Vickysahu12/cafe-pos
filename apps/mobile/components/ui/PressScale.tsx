// components/ui/PressScale.tsx
// ADDED (2026-10-08): UI REDESIGN — har tappable card/tile ka ek jaisa "press" feel.
// USE CASE: Dabate hi (press-in) halka sa andar jaana (scale 0.97, 120ms ease-out) +
// ek haptic tap. Tap commit press-out pe. Isse app "physical" aur fast lagti hai.
//
// FIX (2026-10-08): Reanimated hataya → React Native ka core Animated (useNativeDriver).
// Reanimated 4 Expo Go mein import pe hi crash kar raha tha ("undefined is not a function"
// → Button/PressScale wali har screen ka route load fail). Press scale gesture-driven nahi
// hai, sirf transform + opacity → core Animated native driver pe bhi UI thread pe smooth chalta hai.
//
//  - Layout props (flex, width, margin) isi element pe → parent ke grid mein sahi size
//  - Haptic: ek per tap, visual ke saath; haptics band ho to bhi visual kaafi hai
//  - Reduce motion: scale nahi, sirf halka opacity dim

import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { haptics } from '../../lib/haptics';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/** OS ki "reduce motion" setting (live update ke saath) */
export function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

interface PressScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Default true — chhote/baar-baar wale controls (stepper) pe false */
  haptic?: boolean;
  /** Bade surfaces (hero card) pe kam scale */
  pressedScale?: number;
}

export function PressScale({ children, style, onPress, disabled, haptic = true, pressedScale = 0.97, ...rest }: PressScaleProps) {
  const progress = useRef(new Animated.Value(0)).current; // 0 = rest, 1 = pressed
  const reduced = useReduceMotion();
  const interactive = !!onPress && !disabled;

  const animateTo = (toValue: number) =>
    Animated.timing(progress, { toValue, duration: 120, easing: EASE_OUT, useNativeDriver: true }).start();

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [1, reduced ? 1 : pressedScale] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [1, reduced ? 0.85 : 1] });

  return (
    <AnimatedPressable
      {...rest}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : rest.accessibilityRole}
      pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
      onPressIn={(e) => {
        if (interactive) animateTo(1);
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animateTo(0);
        rest.onPressOut?.(e);
      }}
      onPress={
        interactive
          ? (e) => {
              if (haptic) haptics.tap();
              onPress?.(e);
            }
          : undefined
      }
      style={[style, { transform: [{ scale }], opacity }]}
    >
      {children}
    </AnimatedPressable>
  );
}
