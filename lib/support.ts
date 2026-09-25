import Constants from 'expo-constants';

/**
 * Where Settings sends people for legal text, feedback, and account deletion.
 *
 * Each link is configured, not hardcoded, and a row that has no destination is
 * not drawn at all. The alternative — a permanent row that opens an alert
 * saying the thing is unavailable — is worse than no row: it looks like a
 * broken feature rather than one that has not shipped.
 */
// Each variable is read by its literal name. Expo's Babel transform inlines
// EXPO_PUBLIC_* at build time and cannot see through `process.env[key]`, so a
// dynamic lookup would come back undefined in a real build while passing here.
const clean = (value: string | undefined): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

export const termsUrl = () => clean(process.env.EXPO_PUBLIC_TERMS_URL);
export const privacyUrl = () => clean(process.env.EXPO_PUBLIC_PRIVACY_URL);
export const supportEmail = () => clean(process.env.EXPO_PUBLIC_SUPPORT_EMAIL);

/** The App Store listing, once there is one to rate. */
export function appStoreUrl(): string | null {
  const id = clean(process.env.EXPO_PUBLIC_APP_STORE_ID);
  return id ? `https://apps.apple.com/app/id${id}?action=write-review` : null;
}

/** The version the user is actually running, not a string typed into a screen. */
export function appVersion(): string {
  const { version } = Constants.expoConfig ?? {};
  const build = Constants.expoConfig?.ios?.buildNumber;
  if (!version) return 'development build';
  return build ? `${version} (${build})` : version;
}

/**
 * A mailto with the account already identified, so a support request does not
 * begin with three rounds of "which account is this?".
 */
export function supportMailto(subject: string, username?: string | null): string | null {
  const address = supportEmail();
  if (!address) return null;
  const body = [
    '',
    '',
    '---',
    username ? `Account: @${username}` : null,
    `Museaic ${appVersion()}`,
  ].filter((line) => line !== null).join('\n');
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
