import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';
import { AppleMusicTrack, AppleMusicPlaylist, LibraryPlaylist, LibraryTrack, MusicService } from '../types';
import { cleanArtistName } from './utils';

/**
 * Apple Music integration via MusicKit.
 *
 * HOW IT WORKS:
 * Apple Music auth uses MusicKit, which requires:
 *   1. A server-signed Developer Token JWT (HS256, signed with your Apple Music key)
 *   2. MusicKit JS running in a web context to prompt the user for their iCloud account
 *
 * The connectAppleMusic() function opens your hosted MusicKit auth page in a browser.
 * That page should:
 *   1. Load MusicKit JS from https://js-cdn.music.apple.com/musickit/v3/musickit.js
 *   2. Configure it with your developer token
 *   3. Call Music.authorize() which returns a user token
 *   4. Redirect back to musicbridge://apple-music-callback?token=<userToken>
 *
 * You must host this page yourself (e.g. on Vercel/Netlify) and set
 * EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL in your env.
 *
 * Resources:
 *   - https://developer.apple.com/documentation/musickitjs
 *   - https://developer.apple.com/documentation/applemusicapi
 */

const APPLE_MUSIC_AUTH_URL = process.env.EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL ?? '';
const APPLE_DEVELOPER_TOKEN = process.env.EXPO_PUBLIC_APPLE_DEVELOPER_TOKEN ?? '';
const APPLE_MUSIC_API = 'https://api.music.apple.com/v1';

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Opens a hosted MusicKit auth page in a browser and captures the user token
 * from the deep-link callback URL.
 */
export async function connectAppleMusic(userId: string): Promise<boolean> {
  if (!APPLE_MUSIC_AUTH_URL) {
    console.warn('[AppleMusic] EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL is not set');
    return false;
  }

  try {
    const result = await WebBrowser.openAuthSessionAsync(
      APPLE_MUSIC_AUTH_URL,
      'musicbridge://apple-music-callback',
    );

    if (result.type !== 'success') return false;

    // The callback URL has the format: musicbridge://apple-music-callback?token=XXX
    const url = new URL(result.url);
    const userToken = url.searchParams.get('token');
    if (!userToken) return false;

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

function authHeaders(userToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${APPLE_DEVELOPER_TOKEN}`,
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
  const userToken = await getUserToken(userId);
  if (!userToken || !APPLE_DEVELOPER_TOKEN) return null;

  const cleanedArtist = cleanArtistName(artist);

  try {
    const term = encodeURIComponent(`${title} ${cleanedArtist}`);
    const res = await fetch(
      `${APPLE_MUSIC_API}/catalog/us/search?term=${term}&types=songs&limit=1`,
      { headers: authHeaders(userToken) },
    );
    if (!res.ok) return null;
    const data = await res.json() as {
      results?: { songs?: { data: AppleMusicTrack[] } };
    };
    return data.results?.songs?.data[0]?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Searches Apple Music with a free-form query.
 */
export async function searchTracks(userId: string, query: string): Promise<AppleMusicTrack[]> {
  const userToken = await getUserToken(userId);
  if (!userToken || !APPLE_DEVELOPER_TOKEN) return [];

  try {
    const term = encodeURIComponent(query);
    const res = await fetch(
      `${APPLE_MUSIC_API}/catalog/us/search?term=${term}&types=songs&limit=20`,
      { headers: authHeaders(userToken) },
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
): Promise<string | null> {
  const userToken = await getUserToken(userId);
  if (!userToken || !APPLE_DEVELOPER_TOKEN) return null;

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
        ...authHeaders(userToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;
    const data = await res.json() as { data?: Array<{ id: string }> };
    return data.data?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ─── Deep links ───────────────────────────────────────────────────────────────

/**
 * Returns a deep link that opens the track in the Apple Music app.
 * The storefront ID is embedded in the catalog track ID URL.
 */
export function getAppleMusicDeepLink(trackId: string): string[] {
  // Opens the Apple Music app directly on iOS
  return [
    `music://music.apple.com/us/album/${trackId}`,
    `https://music.apple.com/us/album/${trackId}`
  ];
}

export function getAppleMusicPlaylistDeepLink(playlistId: string): string[] {
  return [
    `music://music.apple.com/library/playlist/${playlistId}`,
    `https://music.apple.com/library/playlist/${playlistId}`
  ];
}

// ─── Library ──────────────────────────────────────────────────────────────────

/**
 * Returns the user's Apple Music library playlists.
 */
export async function getUserPlaylists(userId: string): Promise<LibraryPlaylist[]> {
  const userToken = await getUserToken(userId);
  if (!userToken || !APPLE_DEVELOPER_TOKEN) return [];

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/library/playlists?limit=100`, {
      headers: authHeaders(userToken),
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
  if (!userToken || !APPLE_DEVELOPER_TOKEN) return [];

  try {
    const res = await fetch(
      `${APPLE_MUSIC_API}/me/library/playlists/${playlistId}/tracks?limit=100`,
      { headers: authHeaders(userToken) },
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
  if (!userToken || !APPLE_DEVELOPER_TOKEN) return [];

  try {
    const res = await fetch(`${APPLE_MUSIC_API}/me/library/songs?limit=100`, {
      headers: authHeaders(userToken),
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
