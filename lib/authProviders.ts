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
 *
 * Google needs two client ids, because it signs in through the native iOS
 * sheet rather than a browser. Listing `google` without them would draw a
 * button that throws on the first tap, so both are required before it appears.
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
  return googleClientIds() !== null;
}

export interface GoogleClientIds {
  /**
   * This app's iOS Google client — the same one YouTube Music signs in with,
   * deliberately. Its reverse is the `com.googleusercontent.apps.*` URL scheme
   * in `ios/musicbridge/Info.plist`, and holding a second copy under its own
   * variable would let the plist and the code drift apart silently.
   */
  iosClientId: string;
  /**
   * The audience Supabase verifies the id token against. It must be the *web*
   * client whose id and secret are pasted into Supabase's Google provider.
   * Omitting it yields a token Supabase rejects for audience mismatch, even
   * though the native sheet itself succeeded.
   */
  webClientId: string;
}

/**
 * Both ids or nothing. Half a configuration fails at the point of tapping,
 * which is the failure this module exists to move forward in time.
 */
export function googleClientIds(): GoogleClientIds | null {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!iosClientId || !webClientId) return null;
  return { iosClientId, webClientId };
}

export function enabledSocialProviders(): SocialProvider[] {
  return (['apple', 'google'] as const).filter(isProviderEnabled);
}
