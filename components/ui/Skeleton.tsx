import { useEffect, useState } from 'react';
import { Animated, DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../lib/theme';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** Pulsing placeholder block. Compose several to mirror the loaded layout. */
export function Skeleton({ width = '100%', height = 14, radius, style }: SkeletonProps) {
  const { colors, radius: r } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        { width, height, borderRadius: radius ?? r.sm, backgroundColor: colors.skeleton, opacity: pulse },
        style,
      ]}
    />
  );
}
