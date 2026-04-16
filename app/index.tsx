import { ActivityIndicator, View } from 'react-native';

/**
 * Root index — shows a loading spinner while the auth layout
 * determines whether to redirect to login or the home feed.
 */
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#ffffff" size="large" />
    </View>
  );
}
