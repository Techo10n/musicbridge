import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { supabase } from './supabase';
import { SpotifyTrack } from '../types';
import { cleanArtistName } from './utils';

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
      path: 'spotify-callback',
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

    if (!response.ok) return null;

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
  console.log(`[Spotify Search] Using Token: ${accessToken ? accessToken.substring(0, 15) + '...' : 'null'} for User: ${userId}`);
  if (!accessToken) return null;

  const cleanedArtist = cleanArtistName(artist);

  try {
    const q = encodeURIComponent(`${title} ${cleanedArtist}`);
    console.log(`[Spotify Search] Querying: "${title} ${cleanedArtist}" (encoded: ${q})`);

    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Spotify Search] Error: ${res.status} ${res.statusText}`, errText);
      return null;
    }
    
    const data = await res.json() as { tracks?: { items: SpotifyTrack[] } };
    
    if (!data.tracks?.items?.length) {
      Alert.alert('Search failed', `Could not find: "${title} ${cleanedArtist}"`);
      return null;
    }

    const foundTrack = data.tracks.items[0];
    console.log(`[Spotify Search] Found: "${foundTrack.name}" by ${foundTrack.artists.map((a: any) => a.name).join(', ')}`);
    return foundTrack.id;
  } catch (err) {
    console.error(`[Spotify Search] Exception:`, err);
    return null;
  }
}

/**
 * Searches Spotify with a free-form query and returns up to 20 tracks.
 */
export async function searchTracks(userId: string, query: string): Promise<SpotifyTrack[]> {
  const accessToken = await getSpotifyAccessToken(userId);
  if (!accessToken) return [];

  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=20`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Spotify SearchTracks] Error: ${res.status} ${res.statusText}`, errText);
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
    if (!res.ok) return null;
    const data = await res.json() as { id: string };
    return data.id;
  } catch {
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
    if (!createRes.ok) return null;

    const playlist = await createRes.json() as { id: string };

    if (trackIds.length > 0) {
      const uris = trackIds.map((id) => `spotify:track:${id}`);
      await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uris }),
      });
    }

    return playlist.id;
  } catch {
    return null;
  }
}

// ─── Deep links ───────────────────────────────────────────────────────────────

export function getSpotifyDeepLink(trackId: string): string {
  return `spotify:track:${trackId}`;
}

export function getSpotifyPlaylistDeepLink(playlistId: string): string {
  return `spotify:playlist:${playlistId}`;
}
