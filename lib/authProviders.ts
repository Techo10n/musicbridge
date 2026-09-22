/**
 * Which sign-in methods this build offers.
 *
 * Apple and Google both need provider credentials configured in the Supabase
 * dashboard. A button whose provider is not configured fails at the point of
 * tapping, which breaks the rule that every visible control does something, so
 * the welcome screen only renders the ones this build is set up for.
 *
 * Control it with EXPO_PUBLIC_AUTH_PROVIDERS, a comma-separated list:
 *   EXPO_PUBLIC_AUTH_PROVIDERS=apple,google
 * Unset means email only. `email` is always available and needs no config
 * beyond Supabase's built-in email auth.
 */
import { Platform } from 'react-native';

export type SocialProvider = 'apple' | 'google';

const configured = (process.env.EXPO_PUBLIC_AUTH_PROVIDERS ?? '')
  .split(',')
  .map((entry: string) => entry.trim().toLowerCase())
  .filter(Boolean);

/**
 * Sign in with Apple is iOS-only. Offering it elsewhere would need the web
 * flow, which requires a Services ID and a rotating client secret we have
 * deliberately not set up — see the vault's decisions page.
 */
export function isProviderEnabled(provider: SocialProvider): boolean {
  if (!configured.includes(provider)) return false;
  if (provider === 'apple') return Platform.OS === 'ios';
  return true;
}

export function enabledSocialProviders(): SocialProvider[] {
  return (['apple', 'google'] as const).filter(isProviderEnabled);
}
