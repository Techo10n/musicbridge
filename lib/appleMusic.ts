import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAppleMusicDiagnostics,
  getAppleMusicModuleVersion,
  requestMusicAuthorization,
  requestMusicStorefrontCountryCode,
  requestMusicUserToken,
} from '../modules/apple-music';
import {
  AppleMusicTrack,
  AppleMusicPlaylist,
  LibraryPlaylist,
  LibraryTrack,
  MusicService,
  RecentTrack,
  TopArtist,
  TopTrack,
} from '../types';
import { cleanArtistName, cleanTitle } from './utils';

/**
 * Apple Music integration via native iOS MusicKit / StoreKit.
 *
 * HOW IT WORKS:
 * Apple Music auth uses the local Expo module for the user-facing permission
 * prompt and Music user-token exchange. The app fetches a short-lived
 * server-signed Developer Token JWT from the authenticated
 * `apple-music-auth` Supabase Edge Function so the Apple private key never
 * ships in the client.
 */

const APPLE_MUSIC_API = 'https://api.music.apple.com/v1';
const DEVELOPER_TOKEN_CACHE_BUFFER_MS = 60_000;
const APPLE_MUSIC_STOREFRONT_STORAGE_KEY = 'apple_music_storefront';
const APPLE_MUSIC_PLAYLIST_URL_RETRY_ATTEMPTS = 5;
const APPLE_MUSIC_PLAYLIST_URL_RETRY_DELAY_MS = 1_000;

let cachedDeveloperToken: { token: string; expiresAt: number } | null = null;
let cachedStorefront: string | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeApplePlaybackTimestamp(
  value: string | undefined,
  fallback: string,
): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

/**
 * Derives a two-letter Apple Music storefront ID from the device locale.
 * Apple Music storefronts use the same ISO 3166-1 alpha-2 country codes as
 * locale region subtags (e.g. "en-GB" → "gb", "fr-FR" → "fr").
 * Falls back to "us" if the locale has no region component.
 */
function getLocaleStorefront(): string {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale; // e.g. "en-US", "fr-FR"
    const region = locale.split('-')[1];
    return region ? region.toLowerCase() : 'us';
  } catch {
    return 'us';
  }
}

async function getStorefront(): Promise<string> {
  if (cachedStorefront) return cachedStorefront;

  const nativeStorefront = await requestMusicStorefrontCountryCode();
  if (nativeStorefront) {
    cachedStorefront = nativeStorefront.toLowerCase();
    void AsyncStorage.setItem(APPLE_MUSIC_STOREFRONT_STORAGE_KEY, cachedStorefront);
    return cachedStorefront;
  }

  const persistedStorefront = await AsyncStorage.getItem(APPLE_MUSIC_STOREFRONT_STORAGE_KEY);
  if (persistedStorefront) {
    cachedStorefront = persistedStorefront.toLowerCase();
    return cachedStorefront;
  }

  cachedStorefront = getLocaleStorefront();
  return cachedStorefront;
}

async function getCanonicalTrackUrl(userId: string, trackId: string): Promise<string | null> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return null;

  try {
    const storefront = await getStorefront();
    const res = await fetch(`${APPLE_MUSIC_API}/catalog/${storefront}/songs/${trackId}`, {
      headers,
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: AppleMusicTrack[] };
    return data.data?.[0]?.attributes?.url ?? null;
  } catch {
    return null;
  }
}

async function searchCatalogTrack(
  userId: string,
  title: string,
  artist: string,
): Promise<AppleMusicTrack | null> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return null;

  const cleanedTitle = cleanTitle(title);
  const cleanedArtist = cleanArtistName(artist);

  try {
    const term = encodeURIComponent(`${cleanedTitle} ${cleanedArtist}`);
    const storefront = await getStorefront();
    const res = await fetch(
      `${APPLE_MUSIC_API}/catalog/${storefront}/search?term=${term}&types=songs&limit=1`,
      { headers },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      results?: { songs?: { data: AppleMusicTrack[] } };
    };
    return data.results?.songs?.data[0] ?? null;
  } catch {
    return null;
  }
}

async function getLibraryPlaylistUrl(
  userId: string,
  playlistId: string,
): Promise<string | null> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return null;

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/library/playlists/${playlistId}`, {
      headers,
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: AppleMusicPlaylist[] };
    return data.data?.[0]?.attributes?.url ?? null;
  } catch {
    return null;
  }
}

async function getLibraryPlaylistCatalogUrl(
  userId: string,
  playlistId: string,
): Promise<string | null> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return null;

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/library/playlists/${playlistId}/catalog`, {
      headers,
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      data?: Array<{ attributes?: { url?: string } }>;
    };
    return data.data?.[0]?.attributes?.url ?? null;
  } catch {
    return null;
  }
}

async function resolveLibraryPlaylistUrlWithRetry(
  userId: string,
  playlistId: string,
  initialUrl?: string | null,
): Promise<string | null> {
  if (initialUrl) return initialUrl;

  for (let attempt = 0; attempt < APPLE_MUSIC_PLAYLIST_URL_RETRY_ATTEMPTS; attempt += 1) {
    const catalogUrl = await getLibraryPlaylistCatalogUrl(userId, playlistId);
    if (catalogUrl) return catalogUrl;

    const libraryUrl = await getLibraryPlaylistUrl(userId, playlistId);
    if (libraryUrl) return libraryUrl;

    if (attempt < APPLE_MUSIC_PLAYLIST_URL_RETRY_ATTEMPTS - 1) {
      await sleep(APPLE_MUSIC_PLAYLIST_URL_RETRY_DELAY_MS);
    }
  }

  return null;
}

function buildDeepLinksFromWebUrl(url: string): string[] {
  return [
    url.replace(/^https:\/\//, 'music://'),
    url,
  ];
}

async function getDeveloperToken(): Promise<string | null> {
  if (
    cachedDeveloperToken
    && cachedDeveloperToken.expiresAt * 1000 > Date.now() + DEVELOPER_TOKEN_CACHE_BUFFER_MS
  ) {
    return cachedDeveloperToken.token;
  }

  const { data, error } = await supabase.functions.invoke<{
    token: string;
    expiresAt: number;
  }>('apple-music-auth', {
    body: { action: 'token' },
  });

  if (error || !data?.token || !data.expiresAt) {
    console.error('[AppleMusic] developer token fetch failed:', error);
    return null;
  }

  cachedDeveloperToken = data;
  return data.token;
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

export async function connectAppleMusic(userId: string): Promise<boolean> {
  try {
    console.log('[AppleMusic] native module version:', getAppleMusicModuleVersion());
    const diagnosticsBefore = await getAppleMusicDiagnostics();
    console.log('[AppleMusic] diagnostics before auth:', diagnosticsBefore);

    const status = await requestMusicAuthorization();
    console.log('[AppleMusic] auth status:', status);
    if (status !== 'authorized') {
      const diagnosticsAfter = await getAppleMusicDiagnostics();
      console.log('[AppleMusic] diagnostics after failed auth:', diagnosticsAfter);
      return false;
    }

    const developerToken = await getDeveloperToken();
    console.log('[AppleMusic] developer token:', developerToken ? 'ok' : 'null');
    if (!developerToken) return false;

    const userToken = await requestMusicUserToken(developerToken);
    console.log('[AppleMusic] user token:', userToken ? 'ok' : 'null');
    if (!userToken) return false;

    await getStorefront();

    const { error } = await supabase
      .from('users')
      .update({ apple_music_user_token: userToken })
      .eq('id', userId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('[AppleMusic] connectAppleMusic error:', err);
    return false;
  }
}

/**
 * Disconnects Apple Music by clearing the stored user token.
 */
export async function disconnectAppleMusic(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({ apple_music_user_token: null })
    .eq('id', userId);
}

// ─── Token management ─────────────────────────────────────────────────────────

async function getUserToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('apple_music_user_token')
    .eq('id', userId)
    .single();

  if (error || !data?.apple_music_user_token) return null;
  return data.apple_music_user_token;
}

async function authHeaders(userToken: string): Promise<HeadersInit | null> {
  const developerToken = await getDeveloperToken();
  if (!developerToken) return null;

  return {
    Authorization: `Bearer ${developerToken}`,
    'Music-User-Token': userToken,
  };
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Searches Apple Music for a track by title + artist.
 * Returns the Apple Music track ID, or null.
 */
export async function searchTrack(
  userId: string,
  title: string,
  artist: string,
): Promise<string | null> {
  const track = await searchCatalogTrack(userId, title, artist);
  return track?.id ?? null;
}

/**
 * Searches Apple Music with a free-form query.
 */
export async function searchTracks(userId: string, query: string): Promise<AppleMusicTrack[]> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return [];

  try {
    const term = encodeURIComponent(query);
    const storefront = await getStorefront();
    const res = await fetch(
      `${APPLE_MUSIC_API}/catalog/${storefront}/search?term=${term}&types=songs&limit=20`,
      { headers },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      results?: { songs?: { data: AppleMusicTrack[] } };
    };
    return data.results?.songs?.data ?? [];
  } catch {
    return [];
  }
}

// ─── Playlist creation ────────────────────────────────────────────────────────

/**
 * Creates a new playlist in the user's Apple Music library.
 * Returns the library playlist ID, or null on failure.
 *
 * Note: Apple Music library playlists use the user's iCloud Music Library.
 */
export async function createPlaylist(
  userId: string,
  name: string,
  trackIds: string[],
): Promise<{ id: string; url?: string | null } | null> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return null;

  try {
    const body = {
      attributes: { name, description: 'Shared via MusicBridge' },
      relationships: {
        tracks: {
          data: trackIds.map((id) => ({ id, type: 'songs' })),
        },
      },
    };

    const res = await fetch(`${APPLE_MUSIC_API}/me/library/playlists`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json() as { data?: AppleMusicPlaylist[] };
    const playlist = data.data?.[0];
    if (!playlist?.id) return null;
    const canonicalUrl = await resolveLibraryPlaylistUrlWithRetry(
      userId,
      playlist.id,
      playlist.attributes?.url ?? null,
    );
    return {
      id: playlist.id,
      url: canonicalUrl,
    };
  } catch {
    return null;
  }
}

// ─── Deep links ───────────────────────────────────────────────────────────────

/**
 * Returns deep links that open the track in the Apple Music app for the
 * current user's storefront when possible.
 */
export async function getAppleMusicDeepLink(userId: string, trackId: string): Promise<string[]> {
  const canonicalUrl = await getCanonicalTrackUrl(userId, trackId);
  if (canonicalUrl) return buildDeepLinksFromWebUrl(canonicalUrl);

  const storefront = await getStorefront();
  return buildDeepLinksFromWebUrl(`https://music.apple.com/${storefront}/song/${trackId}`);
}

export async function resolveAppleMusicTrackLinks(
  userId: string,
  title: string | null | undefined,
  artist: string | null | undefined,
  fallbackTrackId?: string | null,
): Promise<string[]> {
  if (title && artist) {
    const track = await searchCatalogTrack(userId, title, artist);
    if (track?.attributes?.url) {
      return buildDeepLinksFromWebUrl(track.attributes.url);
    }
    if (track?.id) {
      return getAppleMusicDeepLink(userId, track.id);
    }
  }

  if (fallbackTrackId) {
    return getAppleMusicDeepLink(userId, fallbackTrackId);
  }

  return [];
}

export function getAppleMusicPlaylistDeepLink(
  playlistId: string,
  canonicalUrl?: string | null,
): string[] {
  if (canonicalUrl) return buildDeepLinksFromWebUrl(canonicalUrl);

  return [
    'music://music.apple.com/library',
    'https://music.apple.com/library',
  ];
}

// ─── Library ──────────────────────────────────────────────────────────────────

/**
 * Returns the user's Apple Music library playlists.
 */
export async function getUserPlaylists(userId: string): Promise<LibraryPlaylist[]> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return [];

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/library/playlists?limit=100`, {
      headers,
    });
    if (!res.ok) return [];
    const data = await res.json() as { data: AppleMusicPlaylist[] };
    return data.data.map((p) => ({
      id: p.id,
      name: p.attributes.name,
      // Apple Music doesn't always return artwork for library playlists
      coverUrl: p.attributes.artwork?.url
        ? resolveArtworkUrl(p.attributes.artwork.url, 300)
        : '',
      trackCount: 0, // not returned in list view; populated when tracks are fetched
      service: 'apple_music' as MusicService,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns tracks in an Apple Music library playlist.
 */
export async function getPlaylistTracks(userId: string, playlistId: string): Promise<LibraryTrack[]> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return [];

  try {
    const res = await fetch(
      `${APPLE_MUSIC_API}/me/library/playlists/${playlistId}/tracks?limit=100`,
      { headers },
    );
    if (!res.ok) return [];
    const data = await res.json() as { data: AppleMusicTrack[] };
    return data.data.map((t) => ({
      id: t.id,
      title: t.attributes.name,
      artist: t.attributes.artistName,
      coverUrl: t.attributes.artwork
        ? resolveArtworkUrl(t.attributes.artwork.url, 150)
        : '',
      service: 'apple_music' as MusicService,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns the user's Apple Music library songs (saved songs), up to 100.
 */
export async function getSavedSongs(userId: string): Promise<LibraryTrack[]> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return [];

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/library/songs?limit=100`, {
      headers,
    });
    if (!res.ok) return [];
    const data = await res.json() as { data: AppleMusicTrack[] };
    return data.data.map((t) => ({
      id: t.id,
      title: t.attributes.name,
      artist: t.attributes.artistName,
      coverUrl: t.attributes.artwork
        ? resolveArtworkUrl(t.attributes.artwork.url, 150)
        : '',
      service: 'apple_music' as MusicService,
    }));
  } catch {
    return [];
  }
}

export async function getSavedSongsCount(userId: string): Promise<number> {
  return (await getSavedSongs(userId)).length;
}

export async function getRecentlyPlayed(userId: string, limit = 10): Promise<RecentTrack[]> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return [];

  try {
    const res = await fetch(
      `${APPLE_MUSIC_API}/me/recent/played/tracks?limit=${Math.min(limit, 10)}`,
      { headers },
    );
    if (!res.ok) return [];
    const data = await res.json() as { data?: AppleMusicTrack[] };
    return (data.data ?? []).map((track) => ({
      id: track.id,
      title: track.attributes.name,
      artist: track.attributes.artistName,
      coverUrl: track.attributes.artwork
        ? resolveArtworkUrl(track.attributes.artwork.url, 150)
        : '',
      playedAt: normalizeApplePlaybackTimestamp(
        track.attributes.lastPlayedDate ?? track.attributes.playedDate,
        new Date().toISOString(),
      ),
      service: 'apple_music' as MusicService,
    }));
  } catch {
    return [];
  }
}

export async function getTopTracks(userId: string, limit = 5): Promise<TopTrack[]> {
  const userToken = await getUserToken(userId);
  const headers = userToken ? await authHeaders(userToken) : null;
  if (!userToken || !headers) return [];

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/history/heavy-rotation?limit=${limit}`, {
      headers,
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: Array<AppleMusicTrack & { type?: string }>;
    };

    const tracks = (data.data ?? [])
      .filter((item) => item.type === 'songs' || !item.type)
      .slice(0, limit)
      .map((track, index) => ({
        id: track.id,
        title: track.attributes.name,
        artist: track.attributes.artistName,
        coverUrl: track.attributes.artwork
          ? resolveArtworkUrl(track.attributes.artwork.url, 150)
          : '',
        popularity: limit - index,
        service: 'apple_music' as MusicService,
      }));
    if (tracks.length > 0) return tracks;
  } catch {
    // Fall back below.
  }

  const savedSongs = await getSavedSongs(userId);
  return savedSongs.slice(0, limit).map((track, index) => ({
    ...track,
    popularity: limit - index,
  }));
}

export async function getTopArtists(userId: string, limit = 5): Promise<TopArtist[]> {
  const songs = await getSavedSongs(userId);
  const counts = new Map<string, { count: number; coverUrl: string }>();

  for (const song of songs) {
    const existing = counts.get(song.artist);
    counts.set(song.artist, {
      count: (existing?.count ?? 0) + 1,
      coverUrl: existing?.coverUrl || song.coverUrl,
    });
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit)
    .map(([artist, info], index) => ({
      id: `apple-artist-${index}-${artist}`,
      name: artist,
      imageUrl: info.coverUrl,
      genres: [],
      service: 'apple_music' as MusicService,
    }));
}

/**
 * Converts an Apple Music artwork URL template to a fully resolved URL.
 * Apple returns URLs with {w} and {h} placeholders.
 */
export function resolveArtworkUrl(
  templateUrl: string,
  size: number = 300,
): string {
  return templateUrl
    .replace('{w}', String(size))
    .replace('{h}', String(size));
}
