import { requireOptionalNativeModule } from 'expo-modules-core';
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
  getDiagnostics(): Promise<AppleMusicDiagnostics>;
  requestStorefrontCountryCode(): Promise<string>;
  requestSubscriptionStatus(): Promise<AppleMusicDiagnostics['capabilities']>;
  requestUserToken(developerToken: string): Promise<string>;
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
  return native.requestAuthorization();
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
