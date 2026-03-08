import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { supabase } from './supabase';
import { YouTubeTrack, LibraryPlaylist, LibraryTrack, MusicService } from '../types';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

// Static Google OAuth 2.0 discovery document
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const SCOPES = ['https://www.googleapis.com/auth/youtube'];

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Opens Google OAuth via PKCE and stores the resulting tokens.
 * Returns true on success.
 */
export async function connectYouTubeMusic(userId: string): Promise<boolean> {
  if (!GOOGLE_CLIENT_ID) throw new Error('EXPO_PUBLIC_GOOGLE_CLIENT_ID is not set');

  // For iOS/Android Client IDs, Google enforces a strict reverse DNS format for the redirect URI
  // e.g. com.googleusercontent.apps.1234567890-abcdefg:/oauth2redirect/google
  // We extract the prefix from the full client ID and build that native redirect URI.
  const clientIdPrefix = GOOGLE_CLIENT_ID.split('.apps.googleusercontent.com')[0];
  const redirectUri = `com.googleusercontent.apps.${clientIdPrefix}:/oauth2redirect/google`;

  const request = new AuthSession.AuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    scopes: SCOPES,
    redirectUri,
    usePKCE: true,
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(DISCOVERY);

  if (result.type === 'cancel' || result.type === 'dismiss') return false;
  if (result.type !== 'success') {
    throw new Error(`OAuth failed: ${result.type}`);
  }

  const tokenResponse = await AuthSession.exchangeCodeAsync(
    {
      clientId: GOOGLE_CLIENT_ID,
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
      youtube_access_token: tokenResponse.accessToken,
      youtube_refresh_token: tokenResponse.refreshToken,
      youtube_token_expiry: expiry,
    })
    .eq('id', userId);

  if (error) throw error;
  return true;
}

/**
 * Disconnects YouTube Music by clearing stored tokens.
 */
export async function disconnectYouTubeMusic(userId: string): Promise<void> {
  await supabase
    .from('users')
    .update({
      youtube_access_token: null,
      youtube_refresh_token: null,
      youtube_token_expiry: null,
    })
    .eq('id', userId);
}

// ─── Token management ─────────────────────────────────────────────────────────

/**
 * Returns a valid YouTube access token, refreshing if expired.
 */
export async function getYouTubeAccessToken(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('users')
    .select('youtube_access_token, youtube_refresh_token, youtube_token_expiry')
    .eq('id', userId)
    .single();

  if (error || !data?.youtube_access_token) return null;

  // Still valid with 60s buffer
  if (data.youtube_token_expiry) {
    const expiry = new Date(data.youtube_token_expiry);
    if (expiry > new Date(Date.now() + 60_000)) {
      return data.youtube_access_token;
    }
  }

  if (!data.youtube_refresh_token) return null;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.youtube_refresh_token,
      client_id: GOOGLE_CLIENT_ID,
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) return null;

    const token = await res.json() as {
      access_token: string;
      expires_in: number;
    };

    const expiry = new Date(Date.now() + token.expires_in * 1000).toISOString();

    await supabase
      .from('users')
      .update({
        youtube_access_token: token.access_token,
        youtube_token_expiry: expiry,
      })
      .eq('id', userId);

    return token.access_token;
  } catch {
    return null;
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Searches for a track by title + artist.
 * Prefers YouTube Music "Artist - Topic" channels (official audio),
 * falling back to the top result filtered by Music topic.
 */
export async function searchTrack(
  userId: string,
  title: string,
  artist: string,
): Promise<string | null> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return null;

  try {
    // We don't append "audio" to the query anymore because it breaks exact title
    // matching for short song titles like "About You". Instead we just rely on the API filters.
    const q = encodeURIComponent(`${title} ${artist}`);
    
    // topicId=/m/04rlf restricts results to the Music freebase topic.
    // videoCategoryId=10 restricts to the Music category.
    const res = await fetch(
      `${YOUTUBE_API}/search?q=${q}&type=video&part=snippet,id&maxResults=10&videoCategoryId=10&topicId=/m/04rlf`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    const data = await res.json() as { items?: YouTubeTrack[] };
    const items = data.items ?? [];

    // YouTube Music auto-generates "Artist - Topic" channels for official audio.
    // Prefer these results over music videos or lyric videos, as these trigger "Song" mode cleanly.
    let bestMatch = items.find((item) => {
      const channel = item.snippet?.channelTitle?.toLowerCase() ?? '';
      const videoTitle = item.snippet?.title?.toLowerCase() ?? '';
      const desc = item.snippet?.description?.toLowerCase() ?? '';
      
      // "Provided to YouTube by" is the standard watermark for official audio distributions
      return channel.endsWith(' - topic') 
          || channel === 'topic'
          || videoTitle.includes('official audio') 
          || desc.includes('provided to youtube');
    });

    // If we didn't find an official Topic/Audio video, try to find a video that at least
    // ISN'T explicitly labeled as a Music Video, Lyric Video, or Live performance.
    if (!bestMatch) {
      bestMatch = items.find((item) => {
        const title = item.snippet?.title?.toLowerCase() ?? '';
        return !title.includes('music video') 
            && !title.includes('lyric') 
            && !title.includes('live')
            && !title.includes('official video');
      });
    }

    if (bestMatch) {
      return bestMatch.id.videoId;
    }

    return items[0]?.id.videoId ?? null;
  } catch {
    return null;
  }
}

/**
 * Searches for tracks with a free-form query.
 * Filtered to Music topic content, sorted by Topic channels first.
 */
export async function searchTracks(userId: string, query: string): Promise<YouTubeTrack[]> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return [];

  try {
    const q = encodeURIComponent(query);
    const res = await fetch(
      `${YOUTUBE_API}/search?q=${q}&type=video&part=snippet,id&maxResults=25&videoCategoryId=10&topicId=/m/04rlf`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as { items?: YouTubeTrack[] };
    const items = data.items ?? [];

    // Surface "Artist - Topic" (official audio) results first
    const topicItems = items.filter((i) => i.snippet?.channelTitle?.endsWith('- Topic'));
    const rest = items.filter((i) => !i.snippet?.channelTitle?.endsWith('- Topic'));
    return [...topicItems, ...rest];
  } catch {
    return [];
  }
}

// ─── Playlist creation ────────────────────────────────────────────────────────

/**
 * Creates a YouTube playlist and populates it with the given video IDs.
 * Returns the playlist ID, or null on failure.
 */
export async function createPlaylist(
  userId: string,
  name: string,
  videoIds: string[],
): Promise<string | null> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return null;

  try {
    // 1. Create the playlist
    const createRes = await fetch(
      `${YOUTUBE_API}/playlists?part=snippet,status`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: { title: name, description: 'Shared via MusicBridge' },
          status: { privacyStatus: 'private' },
        }),
      },
    );
    if (!createRes.ok) return null;
    const playlist = await createRes.json() as { id: string };

    // 2. Add each video as a playlist item
    for (const videoId of videoIds) {
      await fetch(`${YOUTUBE_API}/playlistItems?part=snippet`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            playlistId: playlist.id,
            resourceId: { kind: 'youtube#video', videoId },
          },
        }),
      });
    }

    return playlist.id;
  } catch {
    return null;
  }
}

// ─── Deep links ───────────────────────────────────────────────────────────────

export function getYouTubeMusicDeepLink(videoId: string): string[] {
  // Try iOS YouTube Music first, then fallback to Android/vanilla YouTube scheme.
  // We append &vType=audio as an undocumented parameter that frequently forces the
  // YTM app to open the "Song" tab instead of the "Video" tab on load.
  return [
    `youtubemusic://watch?v=${videoId}&vType=audio`,
    `vnd.youtube://${videoId}`,
    `https://music.youtube.com/watch?v=${videoId}&vType=audio`
  ];
}

export function getYouTubeMusicPlaylistDeepLink(playlistId: string): string[] {
  return [
    `youtubemusic://playlist?list=${playlistId}`,
    `vnd.youtube://www.youtube.com/playlist?list=${playlistId}`,
    `https://music.youtube.com/playlist?list=${playlistId}`
  ];
}

// ─── Library ──────────────────────────────────────────────────────────────────

/**
 * Returns the authenticated user's YouTube playlists.
 */
export async function getUserPlaylists(userId: string): Promise<LibraryPlaylist[]> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return [];

  try {
    const res = await fetch(
      `${YOUTUBE_API}/playlists?part=snippet,contentDetails&mine=true&maxResults=50`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items: Array<{
        id: string;
        snippet: {
          title: string;
          thumbnails: { medium?: { url: string }; default?: { url: string } };
        };
        contentDetails: { itemCount: number };
      }>;
    };
    return data.items.map((p) => ({
      id: p.id,
      name: p.snippet.title,
      coverUrl: p.snippet.thumbnails.medium?.url ?? p.snippet.thumbnails.default?.url ?? '',
      trackCount: p.contentDetails.itemCount,
      service: 'youtube_music' as MusicService,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns tracks in a YouTube playlist, paginating through all pages.
 * Strips " - Topic" suffix from channel names so artist names are clean for cross-service search.
 */
export async function getPlaylistTracks(userId: string, playlistId: string): Promise<LibraryTrack[]> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return [];

  const tracks: LibraryTrack[] = [];
  let pageToken: string | undefined;

  do {
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        playlistId,
        maxResults: '50',
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch(`${YOUTUBE_API}/playlistItems?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) break;
      const data = await res.json() as {
        nextPageToken?: string;
        items: Array<{
          snippet: {
            title: string;
            videoOwnerChannelTitle?: string;
            resourceId: { videoId: string };
            thumbnails: { medium?: { url: string } };
          };
        }>;
      };
      for (const item of data.items) {
        // Skip deleted or private videos
        if (
          item.snippet.title === 'Deleted video' ||
          item.snippet.title === 'Private video'
        ) continue;
        tracks.push({
          id: item.snippet.resourceId.videoId,
          title: item.snippet.title,
          // Strip " - Topic" so artist names match correctly when searching other services
          artist: (item.snippet.videoOwnerChannelTitle ?? '').replace(' - Topic', ''),
          coverUrl: item.snippet.thumbnails.medium?.url ?? '',
          service: 'youtube_music',
        });
      }
      pageToken = data.nextPageToken;
    } catch {
      break;
    }
  } while (pageToken);

  return tracks;
}

/**
 * Returns the user's liked videos. YouTube exposes this as a special playlist with id "LL".
 */
export async function getLikedVideos(userId: string): Promise<LibraryTrack[]> {
  return getPlaylistTracks(userId, 'LL');
}
