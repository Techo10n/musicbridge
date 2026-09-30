import type { GoogleClientIds } from './authProviders';

/** Thrown when the user backs out. Callers show nothing rather than an error. */
export const AUTH_CANCELLED = 'auth_cancelled';

/**
 * Gets a Google identity token from the native iOS sheet.
 *
 * The import is deliberately dynamic. `@react-native-google-signin` binds with
 * `TurboModuleRegistry.getEnforcing`, which throws at *import* time when the
 * native module is absent — a JS-only reload onto a binary built before the
 * package was added, a checkout where nobody ran `pod install`, Expo Go. A
 * static import would put that throw in `hooks/useAuth`, which the root layout
 * imports, so a missing pod would take down the entire app rather than one
 * button. Here the failure is confined to the moment someone taps Google.
 */
export async function getGoogleIdToken(ids: GoogleClientIds): Promise<string> {
  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    // `require`, not `await import`: Metro treats an inline require as a lazy
    // one, and a real dynamic import needs experimental VM modules under Jest,
    // so this stays testable as well as lazy.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin');
  } catch {
    throw new Error('Google sign-in needs a rebuild of the app to work on this device.');
  }

  const { GoogleSignin, isErrorWithCode, statusCodes } = mod;

  GoogleSignin.configure({
    iosClientId: ids.iosClientId,
    // Supabase verifies the token against the provider's authorized client id,
    // which is the *web* client. Omit it and Supabase rejects the token for
    // audience mismatch even though the sheet itself succeeded.
    webClientId: ids.webClientId,
  });

  let idToken: string | null | undefined;
  try {
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    idToken = result.data?.idToken;
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error(AUTH_CANCELLED);
    }
    throw err;
  }

  if (!idToken) throw new Error('Google did not return an identity token');
  return idToken;
}
