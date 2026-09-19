import { ActivityIndicator, View } from 'react-native';
import { useTheme } from '../lib/theme';

/**
 * Root index — a quiet screen while the root layout resolves auth and
 * decides between the sign-in stack and the tabs.
 */
export default function Index() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
