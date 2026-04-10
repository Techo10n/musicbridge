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

  // Google blocks the auth.expo.io shared proxy. Native apps must use the
  // reverse client ID as the redirect scheme (already registered in app.json).
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.googleusercontent.apps.215416693574-ul79o63f153r4eapd9n5a6067roa132b',
  });

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

// ─── Track-matching helpers ───────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Returns true when the result title contains a variant qualifier (remix, live,
 * acoustic, etc.) that is NOT present in the original search title.
 * Uses word boundaries so "live" doesn't match "alive" or "live and let die".
 */
function isBadVariant(resultTitle: string, searchTitle: string): boolean {
  const VARIANTS = /\b(remix|live|acoustic|cover|karaoke|instrumental|extended|vip|demo|reprise|interlude|medley|mashup|tribute)\b/i;
  return VARIANTS.test(resultTitle) && !VARIANTS.test(searchTitle);
}

/**
 * Scores how closely a result title matches the search title (0–4).
 * 4 = exact match after normalisation
 * 3 = one is a prefix of the other
 * 2 = one contains the other
 * 1 = ≥70% word overlap
 * 0 = poor match
 */
function titleScore(resultTitle: string, searchTitle: string): number {
  const r = norm(resultTitle);
  const s = norm(searchTitle);
  if (r === s) return 4;
  if (r.startsWith(s) || s.startsWith(r)) return 3;
  if (r.includes(s) || s.includes(r)) return 2;
  const rWords = new Set(r.split(' '));
  const sWords = s.split(' ').filter(Boolean);
  if (sWords.length > 0 && sWords.filter((w) => rWords.has(w)).length / sWords.length >= 0.7) return 1;
  return 0;
}

/**
 * From a list of candidates, picks the highest-scoring Topic-channel video
 * whose title is NOT a bad variant (remix, live, etc.).
 * Returns undefined when no clean Topic result exists — callers must not fall
 * back to variant results; they should try the next phase instead.
 */
function pickBestCleanTopicResult(
  items: YouTubeTrack[],
  searchTitle: string,
  isTopicChannel: (i: YouTubeTrack) => boolean,
): YouTubeTrack | undefined {
  const clean = items
    .filter(isTopicChannel)
    .filter((i) => !isBadVariant(i.snippet?.title ?? '', searchTitle));

  if (clean.length === 0) return undefined;

  return clean.reduce<YouTubeTrack>((best, item) =>
    titleScore(item.snippet?.title ?? '', searchTitle) >
    titleScore(best.snippet?.title ?? '', searchTitle)
      ? item
      : best,
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Searches for a track by title + artist.
 *
 * Only returns a video from an "Artist - Topic" auto-generated channel — the
 * only video type YouTube Music renders as a Song (square album art, no video
 * player). Never falls back to generic videos.
 *
 * Phase 1: three parallel queries (base / official-audio / topic keyword).
 *   → picks the highest-scoring Topic-channel result, filtering out remixes/
 *     live versions that weren't in the original title.
 * Phase 2: direct Topic-channel lookup → in-channel title search with the
 *   same scoring + variant filtering applied to in-channel results.
 * Throws `youtube_music_topic_not_found` if neither phase finds a Topic video.
 */
export async function searchTrack(
  userId: string,
  title: string,
  artist: string,
): Promise<string> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) throw new Error('[YTM] No access token — user not connected to YouTube Music');

  // For multi-artist strings like "K-391, Alan Walker, Tungevaag, Mangoo"
  // use only the first artist for channel lookups and the tighter base query.
  const primaryArtist = artist.split(',')[0].trim();

  const isTopicChannel = (item: YouTubeTrack): boolean => {
    const ch = item.snippet?.channelTitle?.toLowerCase() ?? '';
    return ch.endsWith(' - topic') || ch === 'topic';
  };

  // videoCategoryId=10 (Music) is enough; topicId uses deprecated Freebase IDs
  // that started returning 403s under load — removed.
  const searchVideos = async (query: string, label: string): Promise<YouTubeTrack[]> => {
    try {
      const res = await fetch(
        `${YOUTUBE_API}/search?q=${encodeURIComponent(query)}&type=video&part=snippet,id&maxResults=10&videoCategoryId=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) {
        if (res.status === 403) {
          try {
            const body = await res.json() as { error?: { errors?: Array<{ reason: string }> } };
            if (body?.error?.errors?.[0]?.reason === 'quotaExceeded') {
              throw new Error('youtube_quota_exceeded');
            }
          } catch (parseErr) {
            if ((parseErr as Error).message === 'youtube_quota_exceeded') throw parseErr;
          }
        }
        console.warn(`[YTM] Video search "${label}" failed: HTTP ${res.status}`);
        return [];
      }
      const data = await res.json() as { items?: YouTubeTrack[] };
      return data.items ?? [];
    } catch (e) {
      if ((e as Error).message === 'youtube_quota_exceeded') throw e;
      console.warn(`[YTM] Video search "${label}" threw:`, e);
      return [];
    }
  };

  // Searches for the artist's Topic channel by name.
  // Uses primaryArtist so multi-artist strings don't break the lookup.
  const findTopicChannelId = async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `${YOUTUBE_API}/search?q=${encodeURIComponent(`${primaryArtist} - Topic`)}&type=channel&part=snippet&maxResults=10`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return null;
      const data = await res.json() as {
        items?: Array<{ id: { channelId: string }; snippet: { title: string } }>;
      };
      const match = (data.items ?? []).find((ch) =>
        ch.snippet.title.toLowerCase().endsWith(' - topic'),
      );
      return match?.id.channelId ?? null;
    } catch {
      return null;
    }
  };

  const searchWithinChannel = async (channelId: string): Promise<YouTubeTrack[]> => {
    try {
      const res = await fetch(
        `${YOUTUBE_API}/search?q=${encodeURIComponent(title)}&type=video&part=snippet,id&maxResults=10&channelId=${channelId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!res.ok) return [];
      const data = await res.json() as { items?: YouTubeTrack[] };
      return data.items ?? [];
    } catch {
      return [];
    }
  };

  // ── Phase 1: 2 parallel queries ──────────────────────────────────────────────
  // Always use primaryArtist — the first artist is the main artist, and the full
  // comma-separated string confuses YouTube search results.
  const [baseItems, audioItems] = await Promise.all([
    searchVideos(`${title} ${primaryArtist}`, 'base'),
    searchVideos(`${title} ${primaryArtist} official audio`, 'official audio'),
  ]);

  const phase1All = [...baseItems, ...audioItems];
  const phase1Topic = phase1All.filter(isTopicChannel);
  const phase1Variants = phase1Topic.filter((i) => isBadVariant(i.snippet?.title ?? '', title));

  console.log(
    `[YTM] searchTrack("${title}" / "${artist}") phase 1: ` +
    `${phase1All.length} results, ${phase1Topic.length} Topic-channel (${phase1Variants.length} are variants)`,
  );

  const phase1Best = pickBestCleanTopicResult(phase1All, title, isTopicChannel);
  if (phase1Best) {
    console.log(
      `[YTM] Phase 1 hit — "${phase1Best.snippet?.title}" by "${phase1Best.snippet?.channelTitle}" ` +
      `(score ${titleScore(phase1Best.snippet?.title ?? '', title)}) — ${phase1Best.id.videoId}`,
    );
    return phase1Best.id.videoId;
  }

  if (phase1Topic.length > 0) {
    console.warn(
      `[YTM] Phase 1: ${phase1Topic.length} Topic result(s) all variants — proceeding to phase 2:\n` +
      phase1Topic.map((i) => `  "${i.snippet?.title}" (${i.id.videoId})`).join('\n'),
    );
  } else {
    console.log(`[YTM] Phase 1: no Topic-channel results. Proceeding to phase 2…`);
  }

  // ── Phase 2: search within Topic channels, using two channel ID sources ───────
  //
  // Source A: channelId values already embedded in phase 1 variant results.
  //   These are the most reliable — we know those channels are Topic channels.
  // Source B: channel name search for "${primaryArtist} - Topic".
  //   Runs in parallel with A so there's no extra latency when A succeeds.
  const variantChannelIds = [
    ...new Set(
      phase1Variants
        .map((i) => i.snippet?.channelId)
        .filter((id): id is string => !!id),
    ),
  ];

  const [searchedChannelId] = await Promise.all([findTopicChannelId()]);

  const allChannelIds = [
    ...new Set([...variantChannelIds, searchedChannelId].filter((id): id is string => !!id)),
  ];

  console.log(
    `[YTM] Phase 2 channel sources — from variants: [${variantChannelIds.join(', ')}], ` +
    `from name search: ${searchedChannelId ?? 'none'}`,
  );

  if (allChannelIds.length > 0) {
    const channelResultSets = await Promise.all(allChannelIds.map(searchWithinChannel));
    const allChannelItems = channelResultSets.flat();

    // All items came from Topic channels; tag them so pickBestCleanTopicResult
    // can process them without needing to check channelTitle.
    const tagged = allChannelItems.map((i) => ({
      ...i,
      snippet: { ...i.snippet, channelTitle: `${primaryArtist} - Topic` },
    }));

    const phase2Best = pickBestCleanTopicResult(tagged, title, () => true);
    if (phase2Best) {
      console.log(
        `[YTM] Phase 2 hit — "${phase2Best.snippet?.title}" ` +
        `(score ${titleScore(phase2Best.snippet?.title ?? '', title)}) — ${phase2Best.id.videoId}`,
      );
      return phase2Best.id.videoId;
    }

    console.warn(
      `[YTM] Phase 2: ${allChannelItems.length} in-channel video(s) all variants:\n` +
      allChannelItems
        .map((i) => `  "${i.snippet?.title}" (score ${titleScore(i.snippet?.title ?? '', title)}, variant: ${isBadVariant(i.snippet?.title ?? '', title)})`)
        .join('\n'),
    );
  } else {
    console.warn(`[YTM] Phase 2: no Topic channel IDs found for "${primaryArtist}"`);
  }

  // ── Both phases failed ────────────────────────────────────────────────────────
  const nonTopicLog = phase1All
    .filter((i) => !isTopicChannel(i))
    .map((i) => `  "${i.snippet?.title}" [${i.snippet?.channelTitle}] (${i.id.videoId})`)
    .join('\n');

  console.error(
    `[YTM] No clean Topic-channel video found for "${title}" by "${artist}".\n` +
    `Non-Topic results (rejected):\n${nonTopicLog || '  (none)'}`,
  );

  throw new Error(
    `youtube_music_topic_not_found: "${title}" by "${artist}" — no canonical YouTube Music Song found. ` +
    `${phase1Variants.length} Topic-channel variant(s) and ${phase1All.length - phase1Topic.length} non-Topic video(s) were rejected.`,
  );
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
  // RDAMVM{videoId} is YouTube Music's internal "music mix" playlist prefix.
  // Passing it as the `list` param signals YTM at load time that this is a
  // music context, which causes the player to resolve to song mode immediately
  // (square album art, clean title) instead of loading raw video metadata first
  // and resolving asynchronously. Without this, users see the video thumbnail
  // and raw title until they navigate away and back.
  const mixList = `RDAMVM${videoId}`;
  return [
    // Primary: YouTube Music custom scheme with music-mix context
    `youtubemusic://watch?v=${videoId}&list=${mixList}`,
    // Fallback: universal web URL (YTM app handles music.youtube.com links on device)
    `https://music.youtube.com/watch?v=${videoId}&list=${mixList}`,
    // Last resort: vanilla YouTube scheme (no music-mix context, but opens something)
    `vnd.youtube://${videoId}`,
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
 * Batch-checks a list of video IDs and returns the subset that belong to
 * videoCategoryId=10 (Music). Processes in groups of 50 (API max).
 */
async function getMusicVideoIds(accessToken: string, videoIds: string[]): Promise<Set<string>> {
  const musicIds = new Set<string>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({ part: 'snippet', id: batch.join(',') });
    try {
      const res = await fetch(`${YOUTUBE_API}/videos?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        items: Array<{ id: string; snippet: { categoryId: string } }>;
      };
      for (const item of data.items) {
        if (item.snippet.categoryId === '10') musicIds.add(item.id);
      }
    } catch {
      // skip batch on error
    }
  }
  return musicIds;
}

/**
 * Returns the authenticated user's YouTube playlists, filtered to playlists
 * whose first video belongs to the Music category (videoCategoryId=10).
 * Playlists that are empty or whose first video cannot be checked are included.
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

    const playlists: LibraryPlaylist[] = data.items.map((p) => ({
      id: p.id,
      name: p.snippet.title,
      coverUrl: p.snippet.thumbnails.medium?.url ?? p.snippet.thumbnails.default?.url ?? '',
      trackCount: p.contentDetails.itemCount,
      service: 'youtube_music' as MusicService,
    }));

    // Fetch the first video ID from each playlist in parallel, then batch-check
    // video categories to filter out non-music playlists.
    const firstVideoIds = await Promise.all(
      playlists.map(async (p) => {
        try {
          const params = new URLSearchParams({
            part: 'snippet',
            playlistId: p.id,
            maxResults: '1',
          });
          const r = await fetch(`${YOUTUBE_API}/playlistItems?${params}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!r.ok) return null;
          const d = await r.json() as {
            items?: Array<{ snippet: { resourceId: { videoId: string } } }>;
          };
          return d.items?.[0]?.snippet?.resourceId?.videoId ?? null;
        } catch {
          return null;
        }
      }),
    );

    const nonNullIds = firstVideoIds.filter((id): id is string => id !== null);
    const musicIds = await getMusicVideoIds(accessToken, nonNullIds);

    return playlists.filter((_, i) => {
      const vid = firstVideoIds[i];
      // Keep if empty/undetermined (vid is null) or confirmed music
      return vid === null || musicIds.has(vid);
    });
  } catch {
    return [];
  }
}

/**
 * Returns tracks in a YouTube playlist, paginating through all pages.
 * Filters out non-music videos (videoCategoryId != 10) via a batch /videos check.
 * Strips " - Topic" suffix from channel names so artist names are clean for cross-service search.
 */
export async function getPlaylistTracks(userId: string, playlistId: string): Promise<LibraryTrack[]> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return [];

  const rawTracks: LibraryTrack[] = [];
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
        rawTracks.push({
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

  // Batch-check video categories; keep only Music (categoryId=10)
  const allIds = rawTracks.map((t) => t.id);
  const musicIds = await getMusicVideoIds(accessToken, allIds);
  return rawTracks.filter((t) => musicIds.has(t.id));
}

/**
 * Returns the user's YouTube Music "Liked Music" playlist (special playlist ID "LM").
 * Unlike "Liked Videos" (LL), this playlist only contains tracks liked within YouTube Music.
 * getPlaylistTracks already filters to videoCategoryId=10, so non-music items are excluded.
 */
export async function getLikedMusic(userId: string): Promise<LibraryTrack[]> {
  return getPlaylistTracks(userId, 'LM');
}

// ─── Profile stats ────────────────────────────────────────────────────────────

const NON_MUSIC_KEYWORDS = [
  'news', 'sports', 'gaming', 'games', 'tech', 'technology', 'comedy',
  'vlog', 'vlogs', 'cooking', 'food', 'travel', 'fitness', 'workout',
  'beauty', 'fashion', 'politics', 'finance', 'investing', 'nba', 'nfl',
  'soccer', 'football', 'basketball', 'baseball', 'cricket',
];

function looksLikeMusicChannel(title: string): boolean {
  const lower = title.toLowerCase();
  return !NON_MUSIC_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Returns channels the user is subscribed to on YouTube.
 * These are the closest equivalent to "followed artists" on YouTube Music.
 * Requires youtube.readonly scope (already included in SCOPES).
 *
 * Fetches up to `limit` subscriptions alphabetically, then applies a
 * best-effort client-side filter to remove obviously non-music channels.
 */
export async function getSubscribedChannels(
  userId: string,
  limit = 50,
): Promise<Array<{ id: string; name: string; imageUrl: string }>> {
  const accessToken = await getYouTubeAccessToken(userId);
  if (!accessToken) return [];

  try {
    const res = await fetch(
      `${YOUTUBE_API}/subscriptions?part=snippet&mine=true&maxResults=${limit}&order=alphabetical`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return [];
    const data = await res.json() as {
      items: Array<{
        snippet: {
          resourceId: { channelId: string };
          title: string;
          thumbnails: { medium?: { url: string }; default?: { url: string } };
        };
      }>;
    };
    return data.items
      .filter((item) => looksLikeMusicChannel(item.snippet.title))
      .map((item) => ({
        id: item.snippet.resourceId.channelId,
        name: item.snippet.title,
        imageUrl:
          item.snippet.thumbnails.medium?.url ??
          item.snippet.thumbnails.default?.url ??
          '',
      }));
  } catch {
    return [];
  }
}

/**
 * Derives profile stats from the user's YouTube Music library.
 *
 * Since YouTube Music's API doesn't expose listening history or top tracks,
 * we build a picture from what IS accessible:
 *  - Liked Music playlist → top artists by frequency of channel titles
 *  - User playlists → playlist count
 *
 * Returns:
 *  - topArtists: most frequent channel names in liked music (up to 5)
 *  - likedCount: number of liked music tracks
 *  - playlistCount: number of user playlists
 *  - topTrack: the most recently liked track (best available proxy)
 */
export async function analyzeYouTubeLibrary(userId: string): Promise<{
  topArtists: Array<{ name: string; count: number }>;
  likedCount: number;
  playlistCount: number;
  topTrack: LibraryTrack | null;
}> {
  const [likedTracks, playlists] = await Promise.all([
    getLikedMusic(userId),
    getUserPlaylists(userId),
  ]);

  // Count artist frequency from liked tracks
  const artistCounts = new Map<string, number>();
  for (const track of likedTracks) {
    if (!track.artist) continue;
    const key = track.artist.replace(/ - Topic$/i, '').trim();
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
  }

  const topArtists = Array.from(artistCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return {
    topArtists,
    likedCount: likedTracks.length,
    playlistCount: playlists.length,
    topTrack: likedTracks[0] ?? null,
  };
}
