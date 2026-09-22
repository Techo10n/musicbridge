import { Stack } from 'expo-router';
import { useTheme } from '../../lib/theme';

export default function OnboardingLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        // No swipe-back: each step depends on the one before it, and the
        // scaffold provides an explicit back control where going back is valid.
        gestureEnabled: false,
      }}
    />
  );
}
