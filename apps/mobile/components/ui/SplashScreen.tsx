// components/ui/SplashScreen.tsx
// USE CASE: Branded animated splash — letter-by-letter reveal of "Billraw" + bottom loading bar.
//           Plays once on launch, then calls onFinish so the app can move to session check/redirect.
// CONNECTED TO: app/index.tsx renders this first, before any auth logic runs.

import { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { theme } from '../../theme';

const BRAND_NAME = 'BillRaw';
const LETTER_STAGGER = 70;
const LETTER_DURATION = 380;
const HOLD_BEFORE_BAR = 250;
const BAR_DURATION = 1500;
const EXIT_DELAY = 250;
const FADE_OUT = 300;

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const letters = BRAND_NAME.split('');
  const letterAnims = useRef(letters.map(() => new Animated.Value(0))).current;
  const barProgress = useRef(new Animated.Value(0)).current;
  const containerFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const letterAnimations = letterAnims.map((anim) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: LETTER_DURATION,
        useNativeDriver: true,
      })
    );

    Animated.sequence([
      Animated.stagger(LETTER_STAGGER, letterAnimations),
      Animated.delay(HOLD_BEFORE_BAR),
      Animated.timing(barProgress, {
        toValue: 1,
        duration: BAR_DURATION,
        useNativeDriver: false,
      }),
      Animated.delay(EXIT_DELAY),
      Animated.timing(containerFade, {
        toValue: 0,
        duration: FADE_OUT,
        useNativeDriver: true,
      }),
    ]).start(() => onFinish());
  }, []);

  const barWidth = barProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: containerFade }]}>
      <View style={styles.wordmarkRow}>
        {letters.map((letter, i) => {
          const translateY = letterAnims[i].interpolate({
            inputRange: [0, 1],
            outputRange: [16, 0],
          });
          return (
            <Animated.Text
              key={i}
              style={[
                styles.letter,
                { opacity: letterAnims[i], transform: [{ translateY }] },
              ]}
            >
              {letter}
            </Animated.Text>
          );
        })}
      </View>

      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmarkRow: {
    flexDirection: 'row',
  },
  letter: {
  fontSize: 48,
  fontFamily: 'SpaceGrotesk_700Bold',
  color: theme.colors.textPrimary,
  letterSpacing: -1.5,
},
  barTrack: {
    position: 'absolute',
    bottom: 64,
    width: 120,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.full,
  },
});