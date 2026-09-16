/**
 * convert-playlist — Supabase Edge Function
 *
 * Converts a shared playlist into the recipient's primary streaming service.
 * Called by the client via supabase.functions.invoke('convert-playlist', { body: { sharedItemId } }).
 * The client's JWT is forwarded automatically, so all Supabase queries run under
 * the recipient's identity and pass Row Level Security.
 *
 * Environment variables required (set via `supabase secrets set`):
 *   SUPABASE_URL              — injected automatically by Supabase
 *   SUPABASE_ANON_KEY         — injected automatically by Supabase
 *   SPOTIFY_CLIENT_ID         — same value as EXPO_PUBLIC_SPOTIFY_CLIENT_ID
 *   GOOGLE_CLIENT_ID          — same value as EXPO_PUBLIC_GOOGLE_CLIENT_ID
 *   APPLE_TEAM_ID             — Apple Developer team ID
 *   APPLE_KEY_ID              — MusicKit key ID
 *   APPLE_PRIVATE_KEY         — MusicKit .p8 private key contents
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * The client this function actually builds. `ReturnType<typeof createClient>`
 * resolves the *unparameterised* overload, whose generics do not match a client
 * created with arguments — so every helper taking one failed to typecheck.
 */
type DbClient = SupabaseClient<any, 'public', any>;

// ─── CORS ─────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const APPLE_MUSIC_PLAYLIST_URL_RETRY_ATTEMPTS = 5;
const APPLE_MUSIC_PLAYLIST_URL_RETRY_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Apple Music developer token ─────────────────────────────────────────────

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlJson(value: unknown): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function createAppleDeveloperToken(): Promise<string | null> {
  const teamId = Deno.env.get('APPLE_TEAM_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const privateKey = Deno.env.get('APPLE_PRIVATE_KEY');
  if (!teamId || !keyId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const signingInput = [
    base64UrlJson({ alg: 'ES256', kid: keyId, typ: 'JWT' }),
    base64UrlJson({ iss: teamId, iat: now, exp: now + 60 * 60 }),
  ].join('.');

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKey.replace(/\\n/g, '\n')),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

// ─── Artist / title normalisation (mirrors lib/utils.ts) ──────────────────────

function cleanArtistName(artist: string): string {
  return artist
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official$/i, '')
    .trim();
}

function cleanTitle(title: string): string {
  return title
    // Strip remaster / deluxe / anniversary suffixes in parentheses or brackets
    .replace(/[\(\[]([^)\]]*(remaster(ed)?|remastered \d{4}|\d{4} remaster|deluxe|anniversary|expanded|bonus track|radio edit|single version|album version|official audio|official music video|official video|visualizer|lyrics?|audio|feat\.|ft\.)[^)\]]*)[\)\]]/gi, '')
    .replace(/\s+-\s+(official audio|official music video|official video|visualizer|lyrics?|audio)$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Token management ─────────────────────────────────────────────────────────

async function refreshSpotifyToken(
  supabase: DbClient,
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: Deno.env.get('SPOTIFY_CLIENT_ID') ?? '',
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '(unreadable)');
    console.error(`[convert-playlist] Spotify token refresh failed: ${res.status} ${errBody}`);
    return null;
  }
  const data = await res.json();
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase.from('users').update({
    spotify_access_token: data.access_token,
    spotify_token_expiry: expiry,
    ...(data.refresh_token ? { spotify_refresh_token: data.refresh_token } : {}),
  }).eq('id', userId);
  return data.access_token;
}

async function refreshYouTubeToken(
  supabase: DbClient,
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
  await supabase.from('users').update({
    youtube_access_token: data.access_token,
    youtube_token_expiry: expiry,
  }).eq('id', userId);
  return data.access_token;
}

async function getSpotifyToken(
  supabase: DbClient,
  userId: string,
  user: Record<string, string | null>,
): Promise<string | null> {
  if (!user.spotify_access_token) return null;
  if (user.spotify_token_expiry) {
    const expiry = new Date(user.spotify_token_expiry);
    if (expiry > new Date(Date.now() + 60_000)) return user.spotify_access_token;
  }
  if (!user.spotify_refresh_token) return null;
  return refreshSpotifyToken(supabase, userId, user.spotify_refresh_token);
}

async function getYouTubeToken(
  supabase: DbClient,
  userId: string,
  user: Record<string, string | null>,
): Promise<string | null> {
  if (!user.youtube_access_token) return null;
  if (user.youtube_token_expiry) {
    const expiry = new Date(user.youtube_token_expiry);
    if (expiry > new Date(Date.now() + 60_000)) return user.youtube_access_token;
  }
  if (!user.youtube_refresh_token) return null;
  return refreshYouTubeToken(supabase, userId, user.youtube_refresh_token);
}

// ─── Track search ─────────────────────────────────────────────────────────────

interface SpotifyItem { id: string; name: string; artists: { name: string }[] }
interface AppleMusicItem {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
  };
}

// Normalise a string for loose word-level matching
function normForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(feat[^)]*\)/gi, '')   // remove (feat. ...) in parens
    .replace(/\bfeat\.?\s+.*/gi, '')  // remove trailing feat. ...
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cache key for a resolved track. Uses the same normalizer as matching so that
 * trivial differences (case, punctuation, a trailing "feat. X") map to one
 * entry rather than repeatedly missing the cache and re-spending quota.
 */
function trackMatchKey(title: string, artist: string): string {
  return `${normForMatch(cleanTitle(title))}|${normForMatch(cleanArtistName(artist))}`;
}


// Fraction of needle's significant words found in haystack (0–1)
function wordCoverage(needle: string, haystack: string): number {
  const words = normForMatch(needle).split(' ').filter(w => w.length > 1);
  if (words.length === 0) return 0;
  const hSet = new Set(normForMatch(haystack).split(' '));
  return words.filter(w => hSet.has(w)).length / words.length;
}

// Pick the best-matching result; return null if nothing clears the threshold
function pickBest(
  items: SpotifyItem[],
  queryTitle: string,
  queryArtist: string,
  minScore = 0.35,
): string | null {
  let best: { id: string; score: number } | null = null;
  for (const item of items) {
    const titleScore = wordCoverage(queryTitle, item.name);
    // Accept the best artist match across all credited artists on the track
    const artistScore = Math.max(0, ...item.artists.map(a => wordCoverage(queryArtist, a.name)));
    const score = titleScore * 0.6 + artistScore * 0.4;
    if (score > (best?.score ?? -1)) best = { id: item.id, score };
  }
  return best && best.score >= minScore ? best.id : null;
}

/**
 * Classify a failed search response.
 *
 * Search failures used to be swallowed into "no results", which meant an expired
 * token or a revoked scope surfaced to the user as "No tracks could be matched
 * on the destination service" — pointing at the matching logic instead of at
 * auth. Auth and quota failures affect every track, so they throw and abort the
 * run; genuinely transient per-request failures are logged and treated as a miss.
 */
async function throwIfSearchUnauthorized(service: string, res: Response): Promise<void> {
  if (res.ok) return;

  let body = '';
  try {
    body = await res.clone().text();
  } catch {
    // Body already consumed or unreadable — status alone is enough to classify.
  }

  if (res.status === 401) throw new Error(`${service}_auth_failed`);
  if (res.status === 403) {
    // YouTube reports quota exhaustion as 403, not 429.
    if (/quotaExceeded|dailyLimitExceeded/i.test(body)) {
      throw new Error(`${service}_quota_exceeded`);
    }
    throw new Error(`${service}_permission_denied`);
  }

  console.error(
    `[convert-playlist] ${service} search failed: ${res.status} ${body.slice(0, 200)}`,
  );
}

/**
 * Write conversion progress to the narrow `conversion_progress` table.
 *
 * This deliberately does NOT touch `shared_items`: that row carries the whole
 * `tracks` jsonb payload, so updating it per track rewrote and re-broadcast the
 * entire payload N times per conversion (see migration 011). Progress writes are
 * additionally throttled — the counter only needs to look smooth, and a 500-track
 * playlist does not need 500 round trips.
 */
const PROGRESS_WRITE_INTERVAL_MS = 500;

async function writeProgress(
  supabase: DbClient,
  sharedItemId: string,
  status: string,
  tracksProcessed: number,
): Promise<void> {
  const { error } = await supabase
    .from('conversion_progress')
    .upsert(
      {
        shared_item_id: sharedItemId,
        status,
        tracks_processed: tracksProcessed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'shared_item_id' },
    );
  // Progress is cosmetic — never fail a conversion because the counter did not persist.
  if (error) console.error(`[convert-playlist] progress write failed: ${error.message}`);
}

async function searchSpotify(token: string, title: string, artist: string): Promise<string | null> {
  const t = cleanTitle(title);
  // Use only the primary artist (strip feat. / comma-separated collaborators)
  const primaryArtist = cleanArtistName(
    artist.split(/[,&]|\bfeat\b|\bft\b/i)[0].trim(),
  );

  const fetchItems = async (query: string, limit = 5): Promise<SpotifyItem[]> => {
    const q = encodeURIComponent(query);
    let retries = 0;
    while (retries <= 3) {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=${limit}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 429) {
        const wait = res.headers.get('Retry-After');
        const ms = wait ? parseInt(wait) * 1000 : 2000 * (retries + 1);
        if (ms > 15_000) throw new Error('spotify_rate_limit_exceeded');
        await new Promise(r => setTimeout(r, ms));
        retries++;
        continue;
      }
      await throwIfSearchUnauthorized('spotify', res);
      if (!res.ok) return [];
      const data = await res.json();
      return data.tracks?.items ?? [];
    }
    return [];
  };

  // Strategy 1: Spotify field-filter — Spotify's own matching is precise so trust the first hit
  const fieldItems = await fetchItems(`track:${t} artist:${primaryArtist}`, 1);
  if (fieldItems.length > 0) return fieldItems[0].id;

  // Strategy 2: Broad keyword search — verify the result actually matches before accepting
  // (prevents returning a completely unrelated popular song when artist name is slightly off)
  const keywordItems = await fetchItems(`${t} ${primaryArtist}`);
  const keywordMatch = pickBest(keywordItems, title, artist);
  if (keywordMatch) return keywordMatch;

  // Strategy 3: Title only — last resort, use a stricter threshold to avoid false positives
  const titleItems = await fetchItems(t);
  return pickBest(titleItems, title, artist, 0.55);
}

/** Strip the " - Topic" suffix to get the channel's artist name. */
function topicChannelArtist(channelTitle: string): string {
  return channelTitle.replace(/\s*-\s*Topic$/i, '').trim();
}

/** Is this result on an "Artist - Topic" channel? */
function isTopicChannel(channelTitle: string | undefined): boolean {
  const ch = channelTitle?.toLowerCase() ?? '';
  return ch.endsWith(' - topic') || ch === 'topic';
}

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: { title: string; channelTitle: string };
}

/**
 * Resolve a track to a YouTube Music "Song".
 *
 * The Topic-channel rule is deliberate and stays: only "Artist - Topic" uploads
 * render as Songs, and anything else appears in the library as a widescreen
 * video — see decisions.md "Never add non-Topic videos to YouTube Music". The
 * way to match more tracks without lowering that bar is to look harder for a
 * Topic result, not to accept non-Topic ones.
 *
 * Two levers, in order of cost:
 *  - `maxResults` is free. A YouTube search costs 100 quota units whether it
 *    returns 5 results or 50, and the previous limit of 10 meant a Topic upload
 *    ranked 11th simply did not exist. This is the single biggest win.
 *  - A second query only when the first finds no Topic candidate at all, so the
 *    common case still costs one search. Quota matters here (see decisions.md
 *    "Bail on rate limits instead of waiting").
 *
 * Scoring now corroborates the artist against the Topic channel name, which is
 * exactly "<artist> - Topic". That makes the wider search *safer* than the old
 * narrow one: previously a candidate was picked on title words alone.
 */
async function searchYouTube(token: string, title: string, artist: string): Promise<string | null> {
  const t = cleanTitle(title);
  // Match searchSpotify's splitting: collaborators make a query too specific.
  const primaryArtist = cleanArtistName(
    artist.split(/[,&]|\bfeat\b|\bft\b/i)[0].trim(),
  );

  const runQuery = async (query: string): Promise<YouTubeSearchItem[]> => {
    const q = encodeURIComponent(query);
    // videoCategoryId=10 (Music); topicId uses deprecated Freebase IDs that
    // return 403s under load.
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?q=${q}&type=video&part=snippet,id&maxResults=50&videoCategoryId=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    await throwIfSearchUnauthorized('youtube', res);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items ?? []) as YouTubeSearchItem[];
  };

  /**
   * Best Topic candidate, or null. Title words must overlap at all — a
   * zero-title-score match is rejected outright even from a Topic channel (see
   * decisions.md "Reject zero-title-score matches"). Beyond that, rank by title
   * match plus artist agreement with the channel name.
   */
  const pickTopic = (items: YouTubeSearchItem[]): string | null => {
    const scored = items
      .filter((i) => i?.id?.videoId && isTopicChannel(i.snippet?.channelTitle))
      .map((i) => {
        const titleScore = wordCoverage(t, i.snippet.title);
        const artistScore = primaryArtist
          ? wordCoverage(primaryArtist, topicChannelArtist(i.snippet.channelTitle))
          : 0;
        return { id: i.id.videoId, titleScore, artistScore };
      })
      .filter((c) => c.titleScore > 0)
      // Weight the title but let a confirmed artist break ties between
      // covers, live versions and the canonical upload.
      .sort((a, b) => (b.titleScore * 2 + b.artistScore) - (a.titleScore * 2 + a.artistScore));

    return scored[0]?.id ?? null;
  };

  const direct = pickTopic(await runQuery(`${t} ${primaryArtist}`));
  if (direct) return direct;

  // Nothing usable. Retry on the title alone: when an artist name is spelled
  // differently on the Topic channel than in the source playlist, including it
  // suppresses the very result we want. The artist still has to corroborate
  // through the channel name in pickTopic, so this widens recall without
  // loosening the quality bar.
  return pickTopic(await runQuery(t));
}

async function searchAppleMusic(
  developerToken: string,
  userToken: string,
  storefront: string,
  title: string,
  artist: string,
): Promise<string | null> {
  const t = cleanTitle(title);
  const a = cleanArtistName(artist);
  const term = encodeURIComponent(`${t} ${a}`);

  const res = await fetch(
    `https://api.music.apple.com/v1/catalog/${storefront}/search?term=${term}&types=songs&limit=10`,
    {
      headers: {
        Authorization: `Bearer ${developerToken}`,
        'Music-User-Token': userToken,
      },
    },
  );
  await throwIfSearchUnauthorized('apple_music', res);
  if (!res.ok) return null;

  const data = await res.json() as {
    results?: { songs?: { data?: AppleMusicItem[] } };
  };
  const items = data.results?.songs?.data ?? [];
  if (items.length === 0) return null;

  const mapped: SpotifyItem[] = items.map((item) => ({
    id: item.id,
    name: item.attributes?.name ?? '',
    artists: [{ name: item.attributes?.artistName ?? '' }],
  }));
  return pickBest(mapped, title, artist) ?? items[0]?.id ?? null;
}

async function getAppleMusicStorefront(
  developerToken: string,
  userToken: string,
): Promise<string> {
  try {
    const res = await fetch('https://api.music.apple.com/v1/me/storefront', {
      headers: {
        Authorization: `Bearer ${developerToken}`,
        'Music-User-Token': userToken,
      },
    });

    if (!res.ok) return 'us';

    const data = await res.json() as {
      data?: Array<{ id?: string }>;
    };
    return data.data?.[0]?.id?.toLowerCase() ?? 'us';
  } catch {
    return 'us';
  }
}

// ─── Playlist cleanup ─────────────────────────────────────────────────────────

// Unfollow removes an owned playlist from the user's library (Spotify has no hard-delete API).
async function deleteSpotifyPlaylist(token: string, playlistId: string): Promise<void> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/followers`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '(unreadable)');
    console.error(`[convert-playlist] Spotify playlist cleanup failed: ${res.status} ${errText}`);
  } else {
    console.log(`[convert-playlist] Deleted empty Spotify playlist ${playlistId}`);
  }
}

async function deleteYouTubePlaylist(token: string, playlistId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlists?id=${encodeURIComponent(playlistId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => '(unreadable)');
    console.error(`[convert-playlist] YouTube playlist cleanup failed: ${res.status} ${errText}`);
  } else {
    console.log(`[convert-playlist] Deleted empty YouTube playlist ${playlistId}`);
  }
}

// ─── Playlist creation ────────────────────────────────────────────────────────

type SpotifyPlaylistResult = {
  playlistId: string;
  tracksAdded: number;
  addError: string | null; // first Spotify error text from add-tracks, if any
};

async function createSpotifyPlaylist(
  token: string,
  name: string,
  trackIds: string[],
): Promise<SpotifyPlaylistResult | null> {
  const createRes = await fetch('https://api.spotify.com/v1/me/playlists', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, public: false, description: 'Shared via Museaic' }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '(unreadable)');
    console.error(`[convert-playlist] Spotify playlist create failed: ${createRes.status} ${errText}`);
    return null;
  }
  const playlist = await createRes.json();

  if (!playlist.id) {
    console.error('[convert-playlist] Spotify playlist create: no id in response', JSON.stringify(playlist));
    return null;
  }

  if (trackIds.length === 0) {
    return { playlistId: playlist.id, tracksAdded: 0, addError: null };
  }

  // Spotify allows max 100 URIs per request — batch if needed
  const uris = trackIds.map((id) => `spotify:track:${id}`);
  let tracksAdded = 0;
  let firstAddError: string | null = null;

  for (let i = 0; i < uris.length; i += 100) {
    const batch = uris.slice(i, i + 100);
    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: batch }),
    });
    if (!addRes.ok) {
      const errText = await addRes.text().catch(() => '(unreadable)');
      console.error(`[convert-playlist] Spotify add tracks failed (batch ${i}): ${addRes.status} ${errText}`);
      if (!firstAddError) firstAddError = `${addRes.status}: ${errText}`;
    } else {
      tracksAdded += batch.length;
    }
  }

  return { playlistId: playlist.id, tracksAdded, addError: firstAddError };
}

async function createYouTubePlaylist(
  token: string,
  name: string,
  videoIds: string[],
): Promise<string | null> {
  const createRes = await fetch(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { title: name, description: 'Shared via Museaic' },
        status: { privacyStatus: 'private' },
      }),
    },
  );
  if (!createRes.ok) return null;
  const playlist = await createRes.json();

  for (const videoId of videoIds) {
    await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snippet: { playlistId: playlist.id, resourceId: { kind: 'youtube#video', videoId } },
      }),
    });
  }

  return playlist.id;
}

async function createAppleMusicPlaylist(
  developerToken: string,
  userToken: string,
  name: string,
  songIds: string[],
): Promise<{ id: string; url?: string | null } | null> {
  const headers = {
    Authorization: `Bearer ${developerToken}`,
    'Music-User-Token': userToken,
  };
  const createRes = await fetch('https://api.music.apple.com/v1/me/library/playlists', {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      attributes: { name, description: 'Shared via Museaic' },
      relationships: {
        tracks: {
          data: songIds.map((id) => ({ id, type: 'songs' })),
        },
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text().catch(() => '(unreadable)');
    console.error(`[convert-playlist] Apple Music playlist create failed: ${createRes.status} ${errText}`);
    return null;
  }

  const payload = await createRes.json() as {
    data?: Array<{ id: string; attributes?: { url?: string } }>;
  };
  const playlist = payload.data?.[0];
  if (!playlist?.id) return null;
  let canonicalUrl = playlist.attributes?.url ?? null;

  for (let attempt = 0; !canonicalUrl && attempt < APPLE_MUSIC_PLAYLIST_URL_RETRY_ATTEMPTS; attempt += 1) {
    const catalogRes = await fetch(
      `https://api.music.apple.com/v1/me/library/playlists/${playlist.id}/catalog`,
      { headers },
    );
    if (catalogRes.ok) {
      const catalogPayload = await catalogRes.json() as {
        data?: Array<{ attributes?: { url?: string } }>;
      };
      canonicalUrl = catalogPayload.data?.[0]?.attributes?.url ?? null;
    }

    if (!canonicalUrl) {
      const detailRes = await fetch(
        `https://api.music.apple.com/v1/me/library/playlists/${playlist.id}`,
        { headers },
      );
      if (detailRes.ok) {
        const detailPayload = await detailRes.json() as {
          data?: Array<{ attributes?: { url?: string } }>;
        };
        canonicalUrl = detailPayload.data?.[0]?.attributes?.url ?? null;
      }
    }

    if (!canonicalUrl && attempt < APPLE_MUSIC_PLAYLIST_URL_RETRY_ATTEMPTS - 1) {
      await sleep(APPLE_MUSIC_PLAYLIST_URL_RETRY_DELAY_MS);
    }
  }

  console.log(
    `[convert-playlist] Apple Music playlist created id=${playlist.id} canonicalUrl=${canonicalUrl ?? 'null'}`,
  );
  return {
    id: playlist.id,
    url: canonicalUrl,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // All queries run as the authenticated user — RLS is enforced automatically
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Must pass the JWT explicitly — there is no persistent session in edge functions,
  // so getUser() without arguments returns null even with a valid token.
  const jwt = authHeader.replace('Bearer ', '');
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !authUser) {
    console.error('[convert-playlist] auth.getUser failed:', authError?.message);
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: { sharedItemId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const { sharedItemId } = body;
  if (!sharedItemId) return json({ error: 'sharedItemId is required' }, 400);

  // Fetch the shared item. The recipient_id filter is a safety belt on top of RLS.
  const { data: item, error: itemErr } = await supabase
    .from('shared_items')
    .select('*')
    .eq('id', sharedItemId)
    .eq('recipient_id', authUser.id)
    .single();

  if (itemErr || !item) {
    console.error('[convert-playlist] shared item fetch failed:', itemErr?.message);
    return json({ error: 'Shared item not found' }, 404);
  }
  if (item.type !== 'playlist') return json({ error: 'Item is not a playlist' }, 400);
  if (!item.tracks?.length) return json({ error: 'Playlist has no tracks' }, 400);

  // Fetch recipient profile for tokens and primary service
  const { data: recipient, error: recipientErr } = await supabase
    .from('users')
    .select(
      'primary_service, spotify_access_token, spotify_refresh_token, spotify_token_expiry, apple_music_user_token, youtube_access_token, youtube_refresh_token, youtube_token_expiry',
    )
    .eq('id', authUser.id)
    .single();

  if (recipientErr || !recipient) {
    console.error('[convert-playlist] recipient fetch failed:', recipientErr?.message);
    return json({ error: 'Recipient profile not found' }, 404);
  }

  const primaryService: string = recipient.primary_service;

  // Resolve access token (refreshing if expired)
  let accessToken: string | null = null;
  let appleDeveloperToken: string | null = null;
  let storefront = 'us';
  if (primaryService === 'spotify') {
    accessToken = await getSpotifyToken(supabase, authUser.id, recipient);
  } else if (primaryService === 'youtube_music') {
    accessToken = await getYouTubeToken(supabase, authUser.id, recipient);
  } else if (primaryService === 'apple_music') {
    accessToken = recipient.apple_music_user_token;
    appleDeveloperToken = await createAppleDeveloperToken();
  }

  // Apple developer token missing is a server-side misconfiguration — not a client-fixable issue
  if (primaryService === 'apple_music' && !appleDeveloperToken) {
    console.error('[convert-playlist] Apple developer token unavailable — APPLE_TEAM_ID / APPLE_KEY_ID / APPLE_PRIVATE_KEY not set');
    await writeProgress(supabase, sharedItemId, 'failed', 0);
    await supabase.from('shared_items').update({ conversion_status: 'failed' }).eq('id', sharedItemId);
    return json({ error: 'server_misconfigured' }, 500);
  }

  if (!accessToken) {
    const hasToken = primaryService === 'spotify'
      ? !!recipient.spotify_access_token
      : primaryService === 'youtube_music'
        ? !!recipient.youtube_access_token
        : !!recipient.apple_music_user_token;
    const errMsg = hasToken ? `${primaryService}_token_unavailable` : 'not_connected';
    console.error(`[convert-playlist] No access token for ${primaryService}. hasToken=${hasToken}, errMsg=${errMsg}`);
    await writeProgress(supabase, sharedItemId, 'failed', 0);
    await supabase.from('shared_items').update({ conversion_status: 'failed' }).eq('id', sharedItemId);
    return json({ error: errMsg }, 400);
  }

  if (primaryService === 'apple_music') {
    storefront = await getAppleMusicStorefront(appleDeveloperToken as string, accessToken);
  }

  // Mark as processing so the client's realtime subscription fires immediately.
  // Status also lands on shared_items so the inbox list can show library state,
  // but that is at most twice per conversion rather than once per track.
  await writeProgress(supabase, sharedItemId, 'processing', 0);
  await supabase
    .from('shared_items')
    .update({ conversion_status: 'processing' })
    .eq('id', sharedItemId);

  // ── Resolve track IDs ──────────────────────────────────────────────────────

  const tracks = item.tracks as Array<{
    title: string;
    artist: string;
    spotify_id: string | null;
    apple_music_id: string | null;
    youtube_music_id: string | null;
  }>;

  const resolvedIds: string[] = [];
  // Tracks the destination service had nothing for. Reported back so the user
  // sees *which* songs are missing rather than only how many.
  const unmatched: { title: string; artist: string }[] = [];
  // Set when the destination service's daily search quota runs out mid-run.
  // A YouTube search costs 100 units against a default 10,000/day, so ~100
  // tracks is the ceiling: a long playlist WILL exhaust it partway.
  let quotaExhausted = false;
  let lastProgressWrite = 0;

  // Load every cached resolution for this playlist in one query. A search costs
  // 100 quota units on YouTube; a cache hit costs nothing, and songs recur
  // heavily across playlists and users, so this is the main lever on how many
  // tracks can be converted per day. Never let a cache failure break a
  // conversion — it is an optimisation, not a source of truth.
  const matchKeys = tracks.map((t) => trackMatchKey(t.title, t.artist));
  const cachedIds = new Map<string, string>();
  try {
    // `in(...)` is serialised into the request URL, so a long playlist would
    // overflow it. Chunk the keys rather than cap the playlist length.
    const uniqueKeys = Array.from(new Set(matchKeys));
    const CACHE_LOOKUP_CHUNK = 50;
    for (let c = 0; c < uniqueKeys.length; c += CACHE_LOOKUP_CHUNK) {
      const chunk = uniqueKeys.slice(c, c + CACHE_LOOKUP_CHUNK);
      const { data: cacheRows, error: cacheErr } = await supabase
        .from('track_matches')
        .select('match_key, external_id')
        .eq('service', primaryService)
        .in('match_key', chunk);
      if (cacheErr) throw cacheErr;
      for (const row of cacheRows ?? []) {
        cachedIds.set(row.match_key as string, row.external_id as string);
      }
    }
  } catch (err) {
    console.error('[convert-playlist] track_matches lookup failed (continuing without cache):', err);
  }
  const newlyResolved = new Map<string, string>();

  // Resolve with bounded concurrency.
  //
  // This loop used to be strictly sequential: one network round trip per track,
  // and up to two once the YouTube matcher gained a fallback query. At 134
  // tracks that ran past the Edge Function worker limit and the whole
  // conversion died with WORKER_RESOURCE_LIMIT — no playlist, nothing saved.
  //
  // The work is IO-bound, so running a handful in flight collapses wall time by
  // roughly the concurrency factor. Kept deliberately modest: Spotify rate
  // limits on burst (searchSpotify backs off on 429), and a higher number buys
  // little once the cache is warm.
  const RESOLVE_CONCURRENCY = 6;

  // Results are placed by index, never appended, so playlist order survives
  // out-of-order completion.
  const resolvedByIndex: (string | null)[] = new Array(tracks.length).fill(null);
  let completed = 0;
  let cursor = 0;

  const resolveOne = async (i: number): Promise<void> => {
    const track = tracks[i];

    // Once quota is gone every further search is a guaranteed failure, so stop
    // paying for them. The slot stays null and is reported as unmatched below.
    if (quotaExhausted) return;

    // Ids carried on the share, then the shared cache, then a paid search.
    const matchKey = matchKeys[i];
    const cached = cachedIds.get(matchKey);
    let id: string | null = null;

    try {
      if (cached) {
        id = cached;
      } else if (primaryService === 'spotify') {
        id = track.spotify_id ?? await searchSpotify(accessToken, track.title, track.artist);
      } else if (primaryService === 'youtube_music') {
        id = track.youtube_music_id ?? await searchYouTube(accessToken, track.title, track.artist);
      } else if (primaryService === 'apple_music' && appleDeveloperToken) {
        id = track.apple_music_id
          ?? await searchAppleMusic(
            appleDeveloperToken,
            accessToken,
            storefront,
            track.title,
            track.artist,
          );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      // Quota exhaustion is not a reason to throw away the tracks already
      // matched. Finish the run with what we have and say why the rest are
      // missing; auth and scope errors still abort, since nothing would work.
      if (msg.endsWith('_quota_exceeded') || msg === 'spotify_rate_limit_exceeded') {
        console.error(`[convert-playlist] ${msg} at track ${i} — finishing with what is already matched.`);
        quotaExhausted = true;
        return;
      }
      throw err;
    }

    if (id) {
      resolvedByIndex[i] = id;
      // Only cache what a search produced. Ids that arrived on the share are
      // already trusted, and re-writing them adds nothing.
      if (!cached) newlyResolved.set(matchKey, id);
    }
    // A miss leaves the slot null. Misses are deliberately not cached: a song
    // missing today may be uploaded tomorrow.
  };

  const runWorker = async (): Promise<void> => {
    for (;;) {
      const i = cursor++;
      if (i >= tracks.length) return;
      await resolveOne(i);
      completed++;

      // Keep the counter smooth without a write per track. Always flush the
      // last completion so the client never sticks below the total.
      const now = Date.now();
      if (completed === tracks.length || now - lastProgressWrite >= PROGRESS_WRITE_INTERVAL_MS) {
        lastProgressWrite = now;
        await writeProgress(supabase, sharedItemId, 'processing', completed);
      }
    }
  };

  try {
    // A throw from any worker rejects here and aborts the conversion, which is
    // what we want for auth and scope failures.
    await Promise.all(
      Array.from({ length: Math.min(RESOLVE_CONCURRENCY, tracks.length) }, runWorker),
    );

    // Collapse to ordered results only once everything has settled.
    for (let i = 0; i < tracks.length; i++) {
      const id = resolvedByIndex[i];
      if (id) resolvedIds.push(id);
      else unmatched.push({ title: tracks[i].title, artist: tracks[i].artist });
    }

    // Contribute this run's resolutions so no one pays for them again. One
    // batched upsert, after the loop, so it costs a single round trip.
    if (newlyResolved.size > 0) {
      const { error: cacheWriteErr } = await supabase
        .from('track_matches')
        .upsert(
          Array.from(newlyResolved, ([match_key, external_id]) => ({
            service: primaryService,
            match_key,
            external_id,
          })),
          { onConflict: 'service,match_key' },
        );
      if (cacheWriteErr) {
        console.error(`[convert-playlist] track_matches write failed: ${cacheWriteErr.message}`);
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await supabase
      .from('shared_items')
      .update({ conversion_status: 'failed' })
      .eq('id', sharedItemId);
    await writeProgress(supabase, sharedItemId, 'failed', 0);
    // Auth/scope failures are the user's to fix (reconnect); quota is transient.
    // Anything else is a genuine server fault.
    const status = msg === 'spotify_rate_limit_exceeded' || msg.endsWith('_quota_exceeded')
      ? 429
      : msg.endsWith('_auth_failed') || msg.endsWith('_permission_denied')
        ? 401
        : 500;
    console.error(`[convert-playlist] conversion aborted: ${msg}`);
    return json({ error: msg }, status);
  }

  if (resolvedIds.length === 0) {
    await supabase
      .from('shared_items')
      .update({ conversion_status: 'failed' })
      .eq('id', sharedItemId);
    await writeProgress(supabase, sharedItemId, 'failed', 0);
    return json({ error: 'No tracks could be matched on the destination service' }, 422);
  }

  console.log(`[convert-playlist] Resolved ${resolvedIds.length}/${tracks.length} tracks for ${primaryService}`);

  // ── Create the playlist ────────────────────────────────────────────────────

  let playlistId: string | null = null;
  let playlistUrl: string | null = null;
  let tracksAdded = 0;
  let addError: string | null = null;

  if (primaryService === 'spotify') {
    const result = await createSpotifyPlaylist(accessToken, item.title, resolvedIds);
    if (result) {
      playlistId = result.playlistId;
      tracksAdded = result.tracksAdded;
      addError = result.addError;
      if (addError) {
        console.error(`[convert-playlist] Spotify add-tracks error: ${addError}`);
      }
    }
  } else if (primaryService === 'youtube_music') {
    playlistId = await createYouTubePlaylist(accessToken, item.title, resolvedIds);
    if (playlistId) tracksAdded = resolvedIds.length;
  } else if (primaryService === 'apple_music' && appleDeveloperToken) {
    const result = await createAppleMusicPlaylist(
      appleDeveloperToken,
      accessToken,
      item.title,
      resolvedIds,
    );
    if (result) {
      playlistId = result.id;
      playlistUrl = result.url ?? null;
      tracksAdded = resolvedIds.length;
    }
  }

  if (!playlistId) {
    console.error(`[convert-playlist] Playlist creation returned null for service=${primaryService}`);
    await writeProgress(supabase, sharedItemId, 'failed', 0);
    await supabase.from('shared_items').update({ conversion_status: 'failed' }).eq('id', sharedItemId);
    return json({ error: 'playlist_creation_failed' }, 500);
  }

  // If zero tracks were added despite having resolved IDs, clean up the empty playlist
  // and return an actionable error.
  if (tracksAdded === 0 && resolvedIds.length > 0) {
    console.error(`[convert-playlist] Playlist ${playlistId} created but 0/${resolvedIds.length} tracks added. Error: ${addError}`);
    // Delete the empty playlist so it doesn't clog the user's library.
    if (primaryService === 'spotify') await deleteSpotifyPlaylist(accessToken, playlistId);
    else if (primaryService === 'youtube_music') await deleteYouTubePlaylist(accessToken, playlistId);

    await writeProgress(supabase, sharedItemId, 'failed', 0);
    await supabase.from('shared_items').update({ conversion_status: 'failed' }).eq('id', sharedItemId);
    // 403 means the token is missing playlist-modify-private scope — give a specific error.
    const errorCode = addError?.startsWith('403') ? 'spotify_permission_denied' : 'tracks_not_added';
    return json({ error: errorCode, detail: addError }, 500);
  }

  // ── Write playlist ID and mark done ───────────────────────────────────────

  const playlistUpdate: Record<string, string> = { conversion_status: 'done' };
  if (primaryService === 'spotify') playlistUpdate.spotify_playlist_id = playlistId;
  else if (primaryService === 'youtube_music') playlistUpdate.youtube_music_playlist_id = playlistId;
  else if (primaryService === 'apple_music') {
    playlistUpdate.apple_music_playlist_id = playlistId;
    if (playlistUrl) playlistUpdate.apple_music_playlist_url = playlistUrl;
  }

  await supabase.from('shared_items').update(playlistUpdate).eq('id', sharedItemId);
  await writeProgress(supabase, sharedItemId, 'done', tracks.length);

  return json({
    playlistId,
    playlistUrl,
    matchedTracks: tracksAdded,
    totalTracks: tracks.length,
    unmatchedTracks: unmatched,
    quotaExhausted,
  });
});
