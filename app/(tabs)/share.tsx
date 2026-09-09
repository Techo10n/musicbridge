import { Redirect } from 'expo-router';

/**
 * Placeholder route backing the center tab pill.
 *
 * The pill supplies its own `tabBarButton`, so pressing it never renders this
 * screen — it pushes straight to People. This only resolves stale deep links
 * (e.g. museaic://share) left over from the removed reel-import flow.
 */
export default function ShareScreen() {
  return <Redirect href="/(tabs)/friends" />;
}
