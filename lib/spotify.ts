import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from './supabase';
import {
  SpotifyTrack,
  SpotifyArtist,
  LibraryPlaylist,
  LibraryTrack,
  LibraryArtist,
  TopTrack,
  TopArtist,
  RecentTrack,
  MusicService,
} from '../types';
import { cleanArtistName, cleanTitle } from './utils';

// Required for OAuth redirect to be handled by the app on iOS/Android
WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? '';

const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.spotify.com/authorize',
  tokenEndpoint: 'https://accounts.spotify.com/api/token',
};

const SCOPES = [
  'user-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'playlist-read-private',
  'user-library-read',
  'user-follow-read',
  'user-top-read',
  'user-read-recently-played',
];

const SPOTIFY_RECONNECT_REQUIRED_KEY = 'spotify_reconnect_required';

let _tokenCache: { userId: string; token: string; expiresAt: number } | null = null;

export async function getSpotifyReconnectRequired(): Promise<boolean> {
  return (await AsyncStorage.getItem(SPOTIFY_RECONNECT_REQUIRED_KEY)) === 'true';
}

async function setSpotifyReconnectRequired(): Promise<void> {
  await AsyncStorage.setItem(SPOTIFY_RECONNECT_REQUIRED_KEY, 'true');
}

async function clearSpotifyReconnectRequired(): Promise<void> {
  await AsyncStorage.removeItem(SPOTIFY_RECONNECT_REQUIRED_KEY);
}

/**
 * Log a failed Spotify response.
 *
 * These call sites all degrade to an empty result on failure, which is fine for
 * rendering but hides *why*. A 401 (dead token), 403 (the app owner's Premium
 * lapsed, which disables the Web API for apps in Development Mode) and a 404
 * (wrong path) are indistinguishable from "this playlist is genuinely empty"
 * unless the status is surfaced. Logging only — control flow is unchanged.
 */
async function logSpotifyError(label: string, res: Response): Promise<void> {
  if (res.ok) return;

  let body = '';
  try {
    body = await res.clone().text();
  } catch {
    // Unreadable body; the status alone is still worth reporting.
  }
  console.error(`[Spotify ${label}] HTTP ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Opens the Spotify PKCE OAuth flow and stores the resulting tokens in Supabase.
 * Returns true on success.
 */
export async function connectSpotify(userId: string): Promise<boolean> {
  try {
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'museaic',
      path: 'callback',
    });

    // Spotify matches this byte-for-byte against the dashboard entry, and
    // `makeRedirectUri` can differ between a dev client and a release build.
    // Log it so a mismatch is diagnosable without guessing.
    if (__DEV__) console.log('[Spotify] redirectUri:', redirectUri);

    // AuthRequest handles PKCE code_verifier/code_challenge generation
    const request = new AuthSession.AuthRequest({
      clientId: CLIENT_ID,
      scopes: SCOPES,
      redirectUri,
      usePKCE: true,
    });

    const result = await request.promptAsync(DISCOVERY);

    if (result.type !== 'success') return false;

    const tokenResponse = await AuthSession.exchangeCodeAsync(
      {
        clientId: CLIENT_ID,
        code: result.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      DISCOVERY,
    );

    const expiry = new Date(
      Date.now() + (tokenResponse.expiresIn ?? 3600) * 1000,
    ).toISOString();

    const { error } = await supabase
      .from('users')
      .update({
        spotify_access_token: tokenResponse.accessToken,
        spotify_refresh_token: tokenResponse.refreshToken,
        spotify_token_expiry: expiry,
      })
      .eq('id', userId);

    if (error) throw error;
    await clearSpotifyReconnectRequired();
    return true;
  } catch (err) {
    console.error('[Spotify] connectSpotify error:', err);
    return false;
  }
}

/**
 * Disconnects Spotify by clearing stored tokens.
 */
export async function disconnectSpotify(userId: string, skipClearReconnect = false): Promise<void> {
  _tokenCache = null;
  await supabase
    .from('users')
    .update({
      spotify_access_token: null,
      spotify_refresh_token: null,
      spotify_token_expiry: null,
    })
    .eq('id', userId);
  if (!skipClearReconnect) {
    await clearSpotifyReconnectRequired();
  }
}

// ─── Token management ─────────────────────────────────────────────────────────

// In-flight refresh promises, keyed by userId. Spotify rotates refresh
// tokens on use, so two concurrent expired-token calls both POSTing a
// refresh can invalidate each other's new refresh token and trip the
// reconnect-required path. Callers racing on the same user share one
// in-flight refresh instead.
const _inFlightRefresh = new Map<string, Promise<string | null>>();

/**
 * Returns a valid Spotify access token for the given user, refreshing if needed.
 * Returns null if the user is not connected to Spotify.
 */
export async function getSpotifyAccessToken(userId: string): Promise<string | null> {
  if (_tokenCache?.userId === userId && _tokenCache.expiresAt > Date.now() + 60_000) {
    return _tokenCache.token;
  }

  const existing = _inFlightRefresh.get(userId);
  if (existing) return existing;

  const promise = fetchOrRefreshSpotifyToken(userId).finally(() => {
    _inFlightRefresh.delete(userId);
  });
  _inFlightRefresh.set(userId, promise);
  return promise;
}

async function fetchOrRefreshSpotifyToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('spotify_access_token, spotify_refresh_token, spotify_token_expiry')
    .eq('id', userId)
    .single();

  if (error || !data?.spotify_access_token) {
    console.error(
      `[Spotify token] no usable access token for ${userId}: ${error ? `query error ${error.message}` : 'spotify_access_token is empty (account not connected)'}`,
    );
    return null;
  }

  // Return existing token if it won't expire within the next 60 seconds
  if (data.spotify_token_expiry) {
    const expiry = new Date(data.spotify_token_expiry);
    if (expiry > new Date(Date.now() + 60_000)) {
      _tokenCache = { userId, token: data.spotify_access_token, expiresAt: expiry.getTime() };
      return data.spotify_access_token;
    }
  }

  // Attempt to refresh
  if (!data.spotify_refresh_token) {
    console.error('[Spotify token] access token expired and no refresh token is stored — reconnect required.');
    return null;
  }

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.spotify_refresh_token,
      client_id: CLIENT_ID,
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '(unreadable)');
      console.error(`[Spotify] token refresh failed: ${response.status} ${errText}`);
      // Treat a failed refresh as a disconnected Spotify account so the app
      // stops retrying with a bad refresh token on every Spotify API call.
      await setSpotifyReconnectRequired().catch((flagErr) => {
        console.error('[Spotify] failed to flag reconnect requirement:', flagErr);
      });
      await disconnectSpotify(userId, true).catch((disconnectErr) => {
        console.error('[Spotify] failed to clear invalid tokens after refresh failure:', disconnectErr);
      });
      return null;
    }

    const token = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const expiresAt = Date.now() + token.expires_in * 1000;
    const expiry = new Date(expiresAt).toISOString();

    _tokenCache = { userId, token: token.access_token, expiresAt };

    await supabase
      .from('users')
      .update({
        spotify_access_token: token.access_token,
        spotify_token_expiry: expiry,
        ...(token.refresh_token && { spotify_refresh_token: token.refresh_token }),
      })
      .eq('id', userId);

    return token.access_token;
  } catch (err) {
    console.error('[Spotify] unexpected token refresh error:', err);
    return null;
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Searches Spotify for a track by title + artist and returns the track ID, or null.
 */
export async function searchTrack(
  userId: string,
  title: string,
  artist: string,
): Promise<string | null> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify searchTrack] no access token — returning empty. Spotify may need reconnecting.');
    return null;
  }

  const cleanedTitle = cleanTitle(title);
  const cleanedArtist = cleanArtistName(artist);

  // Helper: run the actual search with a given query string, respecting rate limits.
  const doSearch = async (rawQuery: string): Promise<string | null> => {
    const q = encodeURIComponent(rawQuery);
    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries <= MAX_RETRIES) {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * (retries + 1);

        // If Spotify bans us for hours (which happens in Developer Mode when spamming), abort!
        if (waitTime > 15000) {
          console.error(`[Spotify Search] CRITICAL RATE LIMIT: Spotify requested we wait ${waitTime}ms. Aborting.`);
          throw new Error('spotify_rate_limit_exceeded');
        }

        console.warn(`[Spotify Search] Rate limited (429). Retrying in ${waitTime}ms (Attempt ${retries + 1}/${MAX_RETRIES}).`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        retries++;
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[Spotify Search] Error: ${res.status} ${res.statusText}`, errText);
        return null;
      }

      const data = await res.json() as { tracks?: { items: SpotifyTrack[] } };
      return data.tracks?.items[0]?.id ?? null;
    }

    return null; // Exceeded retries
  };

  try {
    // First attempt: Spotify field filters with cleaned title/artist.
    const fieldResult = await doSearch(`track:${cleanedTitle} artist:${cleanedArtist}`);
    if (fieldResult) return fieldResult;

    // Fallback: plain keyword search in case the field filter was too strict
    // (e.g. title contains punctuation or the artist name differs slightly).
    console.warn(`[Spotify Search] Field filter returned no results for "${cleanedTitle}" — falling back to plain query.`);
    return await doSearch(`${cleanedTitle} ${cleanedArtist}`);
  } catch (err) {
    console.error(`[Spotify Search] Exception:`, err);
    return null;
  }
}

/**
 * Searches Spotify with a free-form query and returns up to 10 tracks.
 */
export async function searchTracks(userId: string, query: string): Promise<SpotifyTrack[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify searchTracks] no access token — returning empty. Spotify may need reconnecting.');
    return [];
  }

  try {
    const q = encodeURIComponent(query);
    const url = `https://api.spotify.com/v1/search?limit=10&type=track&q=${q}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Spotify SearchTracks] Error: ${res.status} ${res.statusText}`, errText);
      Alert.alert('Search API Error', `URL: ${url}\nError: ${res.status}\nMessage: ${errText}`);
      return [];
    }
    const data = await res.json() as { tracks?: { items: SpotifyTrack[] } };
    return data.tracks?.items ?? [];
  } catch (err) {
    console.error(`[Spotify SearchTracks] Exception:`, err);
    return [];
  }
}

// ─── Playlist creation ────────────────────────────────────────────────────────

/**
 * Gets the Spotify user ID for the given MusicBridge user.
 */
async function getSpotifyUserId(userId: string): Promise<string | null> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getSpotifyUserId] no access token — returning empty. Spotify may need reconnecting.');
    return null;
  }

  try {
    const res = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error('[Spotify] getSpotifyUserId error:', res.status, await res.text());
      return null;
    }
    const data = await res.json() as { id: string };
    return data.id;
  } catch (err) {
    console.error('[Spotify] getSpotifyUserId exception:', err);
    return null;
  }
}

/**
 * Creates a new private playlist in the user's Spotify account and adds the given track IDs.
 * Returns the new playlist's Spotify ID, or null on failure.
 */
export async function createPlaylist(
  userId: string,
  name: string,
  trackIds: string[],
): Promise<string | null> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify createPlaylist] no access token — returning empty. Spotify may need reconnecting.');
    return null;
  }

  const spotifyUserId = await getSpotifyUserId(userId);
  if (!spotifyUserId) return null;

  try {
    const createRes = await fetch(
      `https://api.spotify.com/v1/users/${spotifyUserId}/playlists`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, public: false, description: 'Shared via Museaic' }),
      },
    );
    if (!createRes.ok) {
      console.error('[Spotify] createPlaylist error:', createRes.status, await createRes.text());
      return null;
    }

    const playlist = await createRes.json() as { id: string };

    if (trackIds.length > 0) {
      const uris = trackIds.map((id) => `spotify:track:${id}`);
      for (let i = 0; i < uris.length; i += 100) {
        const chunk = uris.slice(i, i + 100);
        const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uris: chunk }),
        });
        if (!addRes.ok) {
          const chunkNumber = Math.floor(i / 100) + 1;
          console.error(
            `[Spotify] add playlist tracks error (chunk ${chunkNumber}):`,
            addRes.status,
            await addRes.text(),
          );
          return null;
        }
      }
    }

    return playlist.id;
  } catch (err) {
    console.error('[Spotify] createPlaylist exception:', err);
    return null;
  }
}

// ─── Deep links ───────────────────────────────────────────────────────────────

export function getSpotifyDeepLink(trackId: string): string[] {
  return [
    `spotify:track:${trackId}`,
    `https://open.spotify.com/track/${trackId}`
  ];
}

export function getSpotifyPlaylistDeepLink(playlistId: string): string[] {
  return [
    `spotify:playlist:${playlistId}`,
    `https://open.spotify.com/playlist/${playlistId}`
  ];
}

// ─── Library ──────────────────────────────────────────────────────────────────

/**
 * Returns all of the current user's Spotify playlists (owned + followed), paginated.
 */
export async function getUserPlaylists(userId: string): Promise<LibraryPlaylist[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getUserPlaylists] no access token — returning empty. Spotify may need reconnecting.');
    return [];
  }

  const playlists: LibraryPlaylist[] = [];
  let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

  while (url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      await logSpotifyError('getUserPlaylists', res);
      if (!res.ok) break;
      const data = await res.json() as {
        next: string | null;
        items: ({
          id?: string;
          name?: string;
          images?: { url: string }[] | null;
          tracks?: { total: number } | null;
        } | null)[];
      };
      for (const p of data.items) {
        // Spotify returns nulls and partially-populated entries in this list —
        // algorithmic/editorial playlists in particular come back without the
        // `tracks` object for apps in Development Mode. Every field here is
        // therefore optional. One malformed entry must never cost the whole
        // library: this loop previously read `p.tracks.total` directly, and the
        // resulting TypeError was caught by an outer `catch { break }` that
        // abandoned pagination and returned an empty list.
        if (!p?.id) continue;
        playlists.push({
          id: p.id,
          name: p.name ?? 'Untitled playlist',
          coverUrl: p.images?.[0]?.url ?? '',
          trackCount: p.tracks?.total ?? 0,
          service: 'spotify' as MusicService,
        });
      }
      url = data.next;
    } catch (err) {
      console.error('[Spotify getUserPlaylists] request threw:', err);
      break;
    }
  }

  if (__DEV__) console.log(`[Spotify getUserPlaylists] returning ${playlists.length} playlists`);
  return playlists;
}

/**
 * Fetches all tracks in a Spotify playlist, paginating as needed.
 */
export async function getPlaylistTracks(userId: string, playlistId: string, maxTracks?: number): Promise<LibraryTrack[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getPlaylistTracks] aborted — no access token. Returning an empty list.');
    return [];
  }

  const tracks: LibraryTrack[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;

  while (url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      // Spotify withholds algorithmic and editorial playlists (Discover Weekly,
      // Release Radar, Daily Mix...) from apps in Development Mode. They still
      // appear in /me/playlists but their contents 403. That is expected and
      // not actionable, so report it as a warning rather than an error.
      if (res.status === 403) {
        console.warn(`[Spotify getPlaylistTracks] playlist ${playlistId} is not readable by this app (403) — likely an algorithmic or editorial playlist restricted in Development Mode. Skipping.`);
        break;
      }
      await logSpotifyError('getPlaylistTracks', res);
      if (!res.ok) break;
      // Use `/items`, not the documented `/tracks`: this app's credentials get
      // 403 Forbidden on `/tracks` for every playlist, while `/items` returns
      // 200. They differ in shape — `/items` wraps each entry as `{ item }`,
      // `/tracks` as `{ track }` — and the parser previously read only `.track`
      // while the request pointed at `/items`, so it skipped every entry and
      // emptied every playlist, and every playlist share built from one.
      // Reading both keys keeps that mismatch harmless if the endpoint moves.
      const data = await res.json() as {
        next: string | null;
        items: ({ track?: SpotifyTrack | null; item?: SpotifyTrack | null } | null)[];
      };

      if (data.items?.length && !data.items.some((i) => i?.track ?? i?.item)) {
        console.error(
          `[Spotify getPlaylistTracks] ${data.items.length} items returned but none carried a track — keys: ${Object.keys(data.items[0] ?? {}).join(', ')}`,
        );
      }

      for (const entry of data.items) {
        const track = entry?.track ?? entry?.item;
        if (!track?.id) continue;
        tracks.push({
          id: track.id,
          title: track.name,
          artist: (track.artists ?? []).map((a) => a.name).join(', '),
          coverUrl: track.album?.images?.[0]?.url ?? '',
          // Free here — the playlist response already carries the full track
          // object. Capturing it at share time is the only chance: the
          // recipient holds no Spotify token to look it up later.
          isrc: track.external_ids?.isrc ?? null,
          service: 'spotify',
        });
        if (maxTracks !== undefined && tracks.length >= maxTracks) break;
      }
      if (maxTracks !== undefined && tracks.length >= maxTracks) break;
      url = data.next;
    } catch (err) {
      console.error('[Spotify getPlaylistTracks] threw mid-pagination:', err);
      break;
    }
  }

  return maxTracks === undefined ? tracks : tracks.slice(0, maxTracks);
}

/**
 * Returns the total number of the user's saved tracks without fetching them all.
 * Used to populate the "Liked Songs" playlist entry count cheaply.
 */
export async function getSavedTracksCount(userId: string): Promise<number> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getPlaylistTrackCount] no access token — returning empty. Spotify may need reconnecting.');
    return 0;
  }
  let retries = 0;
  while (retries < 3) {
    try {
      const res = await fetch('https://api.spotify.com/v1/me/tracks?limit=1', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 429) {
        const wait = parseInt(res.headers.get('Retry-After') ?? '2', 10) * 1000;
        await new Promise((r) => setTimeout(r, wait));
        retries++;
        continue;
      }
      await logSpotifyError('getPlaylistTrackCount', res);
      if (!res.ok) return 0;
      const data = await res.json() as { total: number };
      return data.total ?? 0;
    } catch (err) {
      console.error('[Spotify getSavedTracksCount] request threw:', err);
      return 0;
    }
  }
  return 0;
}

/**
 * Streams the user's saved tracks page by page, calling onPage after each page.
 * The caller sees the first 50 tracks almost immediately; the rest accumulate.
 * Respects Spotify's Retry-After header on 429 responses.
 */
export async function streamSavedTracks(
  userId: string,
  onPage: (tracks: LibraryTrack[]) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify streamSavedTracks] no access token — returning empty. Spotify may need reconnecting.');
    return;
  }

  let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50';

  while (url && !isCancelled()) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    await logSpotifyError('getSavedTracks', res);
    if (!res.ok) break;

    let data: { next: string | null; items: { track: SpotifyTrack }[] };
    try {
      data = await res.json();
    } catch (err) {
      console.error('[Spotify streamSavedTracks] request threw:', err);
      break;
    }

    const page: LibraryTrack[] = [];
    for (const item of data.items) {
      if (!item.track) continue;
      page.push({
        id: item.track.id,
        title: item.track.name,
        artist: (item.track.artists ?? []).map((a) => a.name).join(', '),
        coverUrl: item.track.album?.images?.[0]?.url ?? '',
        service: 'spotify' as MusicService,
      });
    }
    if (!isCancelled()) onPage(page);
    url = data.next;
  }
}

/**
 * Returns artists the user follows on Spotify.
 * Requires the user-follow-read scope.
 */
export async function getFollowedArtists(userId: string): Promise<LibraryArtist[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getSavedTracks] no access token — returning empty. Spotify may need reconnecting.');
    return [];
  }

  try {
    const res = await fetch('https://api.spotify.com/v1/me/following?type=artist&limit=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    await logSpotifyError('getFollowedArtists', res);
    if (!res.ok) return [];
    const data = await res.json() as {
      artists: {
        items: { id: string; name: string; images: { url: string }[] }[];
      };
    };
    return data.artists.items.map((a) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.images[0]?.url ?? '',
    }));
  } catch (err) {
    console.error('[Spotify getFollowedArtists] request threw:', err);
    return [];
  }
}

// ─── Profile stats ────────────────────────────────────────────────────────────

/**
 * Returns the user's top tracks on Spotify.
 * Requires user-top-read scope.
 * timeRange: 'short_term' (4 weeks) | 'medium_term' (6 months) | 'long_term' (all time)
 */
export async function getTopTracks(
  userId: string,
  limit = 5,
  timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
): Promise<TopTrack[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getFollowedArtists] no access token — returning empty. Spotify may need reconnecting.');
    return [];
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    await logSpotifyError('getTopTracks', res);
    if (!res.ok) return [];
    const data = await res.json() as { items: SpotifyTrack[] };
    return data.items.map((t) => ({
      id: t.id,
      title: t.name,
      artist: (t.artists ?? []).map((a) => a.name).join(', '),
      coverUrl: t.album.images[0]?.url ?? '',
      popularity: t.popularity ?? 0,
      service: 'spotify' as MusicService,
    }));
  } catch (err) {
    console.error('[Spotify getTopTracks] request threw:', err);
    return [];
  }
}

/**
 * Returns the user's top artists on Spotify, including genre data.
 * Requires user-top-read scope.
 */
export async function getTopArtists(
  userId: string,
  limit = 5,
  timeRange: 'short_term' | 'medium_term' | 'long_term' = 'medium_term',
): Promise<TopArtist[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getTopTracks] no access token — returning empty. Spotify may need reconnecting.');
    return [];
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    await logSpotifyError('getTopArtists', res);
    if (!res.ok) return [];
    const data = await res.json() as { items: SpotifyArtist[] };
    return data.items.map((a) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.images[0]?.url ?? '',
      genres: a.genres,
      service: 'spotify' as MusicService,
    }));
  } catch (err) {
    console.error('[Spotify getTopArtists] request threw:', err);
    return [];
  }
}

/**
 * Returns the user's recently played tracks on Spotify.
 * Requires user-read-recently-played scope.
 */
export async function getRecentlyPlayed(userId: string, limit = 20): Promise<RecentTrack[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) {
    console.error('[Spotify getTopArtists] no access token — returning empty. Spotify may need reconnecting.');
    return [];
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    await logSpotifyError('getRecentTracks', res);
    if (!res.ok) return [];
    const data = await res.json() as {
      items: { track: SpotifyTrack; played_at: string }[];
    };
    return data.items.map((item) => ({
      id: item.track.id,
      title: item.track.name,
      artist: (item.track.artists ?? []).map((a) => a.name).join(', '),
      coverUrl: item.track.album?.images?.[0]?.url ?? '',
      playedAt: item.played_at,
      service: 'spotify' as MusicService,
    }));
  } catch (err) {
    console.error('[Spotify getRecentlyPlayed] request threw:', err);
    return [];
  }
}
