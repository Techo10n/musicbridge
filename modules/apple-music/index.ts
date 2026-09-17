import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export type MusicAuthorizationStatus = 'authorized' | 'denied' | 'restricted' | 'notDetermined';

export interface AppleMusicDiagnostics {
  bundleIdentifier: string;
  hasAppleMusicUsageDescription: boolean;
  skCloudServiceAuthorizationStatus: MusicAuthorizationStatus;
  musicAuthorizationStatus: MusicAuthorizationStatus | 'unavailable';
  capabilities?: {
    musicCatalogPlayback: boolean;
    musicCatalogSubscriptionEligible: boolean;
    addToCloudMusicLibrary: boolean;
  };
  capabilitiesError?: string | null;
}

interface AppleMusicNativeModule {
  getModuleVersion(): string;
  requestAuthorization(): Promise<MusicAuthorizationStatus>;
  getDiagnostics(): AppleMusicDiagnostics;
  requestStorefrontCountryCode(): Promise<string>;
  requestSubscriptionStatus(): Promise<AppleMusicDiagnostics['capabilities']>;
  requestUserToken(developerToken: string): Promise<string>;
  playLibraryPlaylist(playlistId: string): Promise<boolean>;
}

const native: AppleMusicNativeModule | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule('AppleMusic') : null;

export function getAppleMusicModuleVersion(): string | null {
  if (!native) return null;
  try {
    return native.getModuleVersion();
  } catch (err) {
    console.error('[AppleMusic] getModuleVersion failed:', err);
    return null;
  }
}

export async function requestMusicAuthorization(): Promise<MusicAuthorizationStatus> {
  if (!native) return 'denied';
  try {
    return await native.requestAuthorization();
  } catch (err) {
    console.error('[AppleMusic] requestAuthorization failed:', err);
    return 'denied';
  }
}

export async function getAppleMusicDiagnostics(): Promise<AppleMusicDiagnostics | null> {
  if (!native) return null;
  try {
    return await native.getDiagnostics();
  } catch (err) {
    console.error('[AppleMusic] getDiagnostics failed:', JSON.stringify(err), err);
    return null;
  }
}

export async function requestMusicStorefrontCountryCode(): Promise<string | null> {
  if (!native) return null;
  try {
    const storefront = await native.requestStorefrontCountryCode();
    return storefront || null;
  } catch (err) {
    console.error('[AppleMusic] requestStorefrontCountryCode failed:', err);
    return null;
  }
}

export async function requestMusicUserToken(developerToken: string): Promise<string | null> {
  if (!native) return null;
  try {
    return await native.requestUserToken(developerToken);
  } catch (err) {
    console.error('[AppleMusic] requestUserToken failed:', err);
    return null;
  }
}

/**
 * Start a library playlist playing in the Music app.
 *
 * iOS has no API to navigate the Music app to a specific library playlist, and
 * library ids are not deep-linkable. Queueing it on the system player is the
 * closest available: switching to Music shows it as Now Playing, whose title
 * links through to the playlist.
 *
 * Returns false when the playlist is not in the device library yet — a playlist
 * created through the Apple Music API syncs asynchronously — so the caller can
 * fall back to opening the library.
 */
export async function playAppleMusicLibraryPlaylist(playlistId: string): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.playLibraryPlaylist(playlistId);
  } catch (err) {
    console.error('[AppleMusic] playLibraryPlaylist failed:', err);
    return false;
  }
}
