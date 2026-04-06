import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { supabase } from './supabase';
import { SpotifyTrack, LibraryPlaylist, LibraryTrack, LibraryArtist, MusicService } from '../types';
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
];

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Opens the Spotify PKCE OAuth flow and stores the resulting tokens in Supabase.
 * Returns true on success.
 */
export async function connectSpotify(userId: string): Promise<boolean> {
  try {
    const redirectUri = AuthSession.makeRedirectUri({
      scheme: 'musicbridge',
      path: 'callback',
    });

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
    return true;
  } catch (err) {
    console.error('[Spotify] connectSpotify error:', err);
    return false;
  }
}

/**
 * Disconnects Spotify by clearing stored tokens.
 */
export async function disconnectSpotify(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({
      spotify_access_token: null,
      spotify_refresh_token: null,
      spotify_token_expiry: null,
    })
    .eq('id', userId);
}

// ─── Token management ─────────────────────────────────────────────────────────

/**
 * Returns a valid Spotify access token for the given user, refreshing if needed.
 * Returns null if the user is not connected to Spotify.
 */
export async function getSpotifyAccessToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('spotify_access_token, spotify_refresh_token, spotify_token_expiry')
    .eq('id', userId)
    .single();

  if (error || !data?.spotify_access_token) return null;

  // Return existing token if it won't expire within the next 60 seconds
  if (data.spotify_token_expiry) {
    const expiry = new Date(data.spotify_token_expiry);
    if (expiry > new Date(Date.now() + 60_000)) {
      return data.spotify_access_token;
    }
  }

  // Attempt to refresh
  if (!data.spotify_refresh_token) return null;

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
      return null;
    }

    const token = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const expiry = new Date(Date.now() + token.expires_in * 1000).toISOString();

    await supabase
      .from('users')
      .update({
        spotify_access_token: token.access_token,
        spotify_token_expiry: expiry,
        ...(token.refresh_token && { spotify_refresh_token: token.refresh_token }),
      })
      .eq('id', userId);

    return token.access_token;
  } catch {
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
  if (!accessToken) return null;

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
  if (!accessToken) return [];

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
export async function getSpotifyUserId(userId: string): Promise<string | null> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) return null;

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
  if (!accessToken) return null;

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
        body: JSON.stringify({ name, public: false, description: 'Shared via MusicBridge' }),
      },
    );
    if (!createRes.ok) {
      console.error('[Spotify] createPlaylist error:', createRes.status, await createRes.text());
      return null;
    }

    const playlist = await createRes.json() as { id: string };

    if (trackIds.length > 0) {
      const uris = trackIds.map((id) => `spotify:track:${id}`);
      const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris }),
      });
      if (!addRes.ok) {
        console.error('[Spotify] add playlist tracks error:', addRes.status, await addRes.text());
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
  if (!accessToken) return [];

  const playlists: LibraryPlaylist[] = [];
  let url: string | null = 'https://api.spotify.com/v1/me/playlists?limit=50';

  while (url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) break;
      const data = await res.json() as {
        next: string | null;
        items: Array<{
          id: string;
          name: string;
          images: Array<{ url: string }>;
          tracks: { total: number };
        } | null>;
      };
      for (const p of data.items) {
        if (!p) continue;
        playlists.push({
          id: p.id,
          name: p.name,
          coverUrl: p.images[0]?.url ?? '',
          trackCount: p.tracks.total,
          service: 'spotify' as MusicService,
        });
      }
      url = data.next;
    } catch {
      break;
    }
  }

  return playlists;
}

/**
 * Fetches all tracks in a Spotify playlist, paginating as needed.
 */
export async function getPlaylistTracks(userId: string, playlistId: string): Promise<LibraryTrack[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) return [];

  const tracks: LibraryTrack[] = [];
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (url) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) break;
      const data = await res.json() as {
        next: string | null;
        items: Array<{ track: SpotifyTrack | null }>;
      };
      for (const item of data.items) {
        if (!item.track) continue;
        tracks.push({
          id: item.track.id,
          title: item.track.name,
          artist: item.track.artists.map((a) => a.name).join(', '),
          coverUrl: item.track.album.images[0]?.url ?? '',
          service: 'spotify',
        });
      }
      url = data.next;
    } catch {
      break;
    }
  }

  return tracks;
}

/**
 * Returns the total number of the user's saved tracks without fetching them all.
 * Used to populate the "Liked Songs" playlist entry count cheaply.
 */
export async function getSavedTracksCount(userId: string): Promise<number> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) return 0;
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
      if (!res.ok) return 0;
      const data = await res.json() as { total: number };
      return data.total ?? 0;
    } catch {
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
  if (!accessToken) return;

  let url: string | null = 'https://api.spotify.com/v1/me/tracks?limit=50';

  while (url && !isCancelled()) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) break;

    let data: { next: string | null; items: Array<{ track: SpotifyTrack }> };
    try {
      data = await res.json();
    } catch {
      break;
    }

    const page: LibraryTrack[] = [];
    for (const item of data.items) {
      if (!item.track) continue;
      page.push({
        id: item.track.id,
        title: item.track.name,
        artist: item.track.artists.map((a) => a.name).join(', '),
        coverUrl: item.track.album.images[0]?.url ?? '',
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
  if (!accessToken) return [];

  try {
    const res = await fetch('https://api.spotify.com/v1/me/following?type=artist&limit=50', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      artists: {
        items: Array<{ id: string; name: string; images: Array<{ url: string }> }>;
      };
    };
    return data.artists.items.map((a) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.images[0]?.url ?? '',
    }));
  } catch {
    return [];
  }
}
