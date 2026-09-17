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

/**
 * Exact-match a recording by ISRC.
 *
 * An ISRC identifies one specific recording, so this is identity rather than
 * similarity: no title normalisation, no artist heuristics, no chance of a
 * remix, a cover, or an impostor. Spotify and Apple Music both expose ISRCs and
 * both allow searching by one, which makes conversion between those two exact.
 *
 * YouTube has no equivalent — the Data API exposes no ISRC — which is why the
 * YouTube path still relies on scored search.
 *
 * Returns null when the ISRC is absent from the destination catalogue, and the
 * caller falls back to searching.
 */
async function lookupByIsrc(
  service: string,
  isrc: string,
  token: string,
  appleDeveloperToken: string | null,
  storefront: string,
): Promise<string | null> {
  try {
    if (service === 'spotify') {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(`isrc:${isrc}`)}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await throwIfSearchUnauthorized('spotify', res);
      if (!res.ok) return null;
      const data = await res.json() as { tracks?: { items?: { id: string }[] } };
      return data.tracks?.items?.[0]?.id ?? null;
    }

    if (service === 'apple_music' && appleDeveloperToken) {
      const res = await fetch(
        `https://api.music.apple.com/v1/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(isrc)}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${appleDeveloperToken}`,
            'Music-User-Token': token,
          },
        },
      );
      await throwIfSearchUnauthorized('apple_music', res);
      if (!res.ok) return null;
      const data = await res.json() as { data?: { id: string }[] };
      return data.data?.[0]?.id ?? null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    // Quota and auth failures must still propagate; a missing ISRC must not.
    if (msg.endsWith('_quota_exceeded') || msg.endsWith('_auth_failed') ||
        msg.endsWith('_permission_denied') || msg === 'spotify_rate_limit_exceeded') {
      throw err;
    }
    console.error(`[convert-playlist] ISRC lookup failed for ${isrc} on ${service}:`, err);
  }
  return null;
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

/**
 * Version markers that make a result a *different recording* of the same song.
 * A remix, cover or live take is not the track the sender shared, so one of
 * these in the candidate that is absent from the source is disqualifying.
 */
const VERSION_MARKERS =
  /\b(remix|remixed|cover|covered|live|acoustic|instrumental|karaoke|nightcore|sped|slowed|reverb|tribute|mashup|bootleg|rework|demo|session|8d|reimagined|rerecorded|taylors version)\b/i;

function matchTokens(s: string): string[] {
  return normForMatch(s).split(' ').filter((w) => w.length > 1);
}

/**
 * Compare two titles in both directions.
 *
 * `recall` is how much of the source title the candidate covers, `precision`
 * how much of the candidate is accounted for by the source. Only measuring
 * recall — which is what wordCoverage does — scores "About You (Sped Up Remix)"
 * identically to "About You", because extra words cost nothing. Precision is
 * what separates the canonical upload from every embellished variant of it.
 */
function titleSimilarity(source: string, candidate: string): { recall: number; precision: number } {
  const a = new Set(matchTokens(source));
  const b = new Set(matchTokens(candidate));
  if (a.size === 0 || b.size === 0) return { recall: 0, precision: 0 };
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return { recall: shared / a.size, precision: shared / b.size };
}

/**
 * View counts for up to 50 video ids, in one call.
 *
 * `videos.list` costs 1 quota unit against `search.list`'s 100, so this is
 * effectively free next to the search that produced the ids.
 *
 * Why it is needed: gates can tell a remix from an original, but they cannot
 * tell the real upload from an AI-generated impostor carrying the same title on
 * a same-named Topic channel, or from an obscure single edit. Those score
 * identically on every textual signal. Popularity is what separates them, and
 * it is the same thing that puts the canonical version at the top when you
 * search in the YouTube Music app.
 */
async function fetchViewCounts(token: string, ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.slice(0, 50).join(',')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      console.error(`[convert-playlist] videos.list failed: ${res.status}`);
      return counts;
    }
    const data = await res.json() as {
      items?: { id: string; statistics?: { viewCount?: string } }[];
    };
    for (const item of data.items ?? []) {
      counts.set(item.id, Number(item.statistics?.viewCount ?? 0));
    }
  } catch (err) {
    // Ranking degrades to textual scoring; never fail a conversion over this.
    console.error('[convert-playlist] videos.list threw:', err);
  }
  return counts;
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
/**
 * Resolve an artist's "<artist> - Topic" channel id, caching the result.
 *
 * Costs a search (100 units) on a miss, which is why callers only reach for
 * this after a broad search has already failed. The cache is shared across
 * users and runs — a channel id is a stable public fact about an artist — so
 * the cost is paid once per artist for the whole app, not once per track.
 */
async function findArtistTopicChannel(
  supabase: DbClient,
  token: string,
  artist: string,
  seen: Map<string, string | null>,
): Promise<string | null> {
  const key = normForMatch(cleanArtistName(artist));
  if (!key) return null;
  if (seen.has(key)) return seen.get(key) ?? null;

  try {
    const { data } = await supabase
      .from('artist_channels')
      .select('channel_id')
      .eq('service', 'youtube_music')
      .eq('artist_key', key)
      .maybeSingle();
    if (data?.channel_id) {
      seen.set(key, data.channel_id as string);
      return data.channel_id as string;
    }
  } catch (err) {
    console.error('[convert-playlist] artist_channels lookup failed:', err);
  }

  let channelId: string | null = null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?q=${encodeURIComponent(`${artist} - Topic`)}&type=channel&part=snippet&maxResults=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    await throwIfSearchUnauthorized('youtube', res);
    if (res.ok) {
      const data = await res.json() as {
        items?: { id?: { channelId?: string }; snippet?: { title?: string } }[];
      };
      // Only an actual Topic channel will do — a regular artist channel hosts
      // videos, which is the thing the Topic rule exists to exclude.
      const match = (data.items ?? []).find((c) =>
        isTopicChannel(c.snippet?.title) &&
        wordCoverage(cleanArtistName(artist), topicChannelArtist(c.snippet?.title ?? '')) >= 0.5
      );
      channelId = match?.id?.channelId ?? null;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.endsWith('_quota_exceeded') || msg.endsWith('_auth_failed') || msg.endsWith('_permission_denied')) throw err;
    console.error('[convert-playlist] artist channel search failed:', err);
  }

  seen.set(key, channelId);
  if (channelId) {
    const { error } = await supabase
      .from('artist_channels')
      .upsert({ service: 'youtube_music', artist_key: key, channel_id: channelId }, { onConflict: 'service,artist_key' });
    if (error) console.error(`[convert-playlist] artist_channels write failed: ${error.message}`);
  }
  return channelId;
}

async function searchYouTube(
  token: string,
  title: string,
  artist: string,
  supabase: DbClient,
  channelCache: Map<string, string | null>,
): Promise<string | null> {
  const t = cleanTitle(title);
  // Match searchSpotify's splitting: collaborators make a query too specific.
  const primaryArtist = cleanArtistName(
    artist.split(/[,&]|\bfeat\b|\bft\b/i)[0].trim(),
  );

  const runQuery = async (query: string, channelId?: string): Promise<YouTubeSearchItem[]> => {
    const q = encodeURIComponent(query);
    // videoCategoryId=10 (Music); topicId uses deprecated Freebase IDs that
    // return 403s under load. A channelId scopes the search to one channel, and
    // is mutually exclusive with the category filter.
    const scope = channelId
      ? `&channelId=${encodeURIComponent(channelId)}`
      : '&videoCategoryId=10';
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?q=${q}&type=video&part=snippet,id&maxResults=50${scope}`,
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
  // A remix, cover, or same-name song by another artist is a *wrong* result,
  // not a near miss — the sender's track is silently replaced and nobody can
  // tell. The governing rule is the same one behind the Topic-channel filter:
  // a missing song beats a wrong one. So these are hard gates, not weights.
  const MIN_TITLE_RECALL = 0.8;    // nearly all of the source title must appear
  const MIN_TITLE_PRECISION = 0.5; // and the candidate must not be mostly extra words
  const MIN_ARTIST_SCORE = 0.5;    // the Topic channel must name the right artist

  const sourceIsVersioned = VERSION_MARKERS.test(t);

  const pickTopic = async (items: YouTubeSearchItem[]): Promise<string | null> => {
    const eligible = items
      .filter((i) => i?.id?.videoId && isTopicChannel(i.snippet?.channelTitle))
      .map((i) => {
        const { recall, precision } = titleSimilarity(t, i.snippet.title);
        // A Topic channel is named exactly "<artist> - Topic", so it is a
        // reliable statement of who actually performs this recording.
        const artistScore = primaryArtist
          ? wordCoverage(primaryArtist, topicChannelArtist(i.snippet.channelTitle))
          : 0;
        // Reject a remix/live/cover unless the sender asked for one.
        const addsVersion = !sourceIsVersioned && VERSION_MARKERS.test(i.snippet.title);
        return { id: i.id.videoId, recall, precision, artistScore, addsVersion };
      })
      .filter((c) =>
        !c.addsVersion &&
        c.recall >= MIN_TITLE_RECALL &&
        c.precision >= MIN_TITLE_PRECISION &&
        c.artistScore >= MIN_ARTIST_SCORE
      );

    if (eligible.length === 0) return null;
    if (eligible.length === 1) return eligible[0].id;

    // Several candidates clear every textual gate — which is the normal case,
    // and precisely where title scoring runs out of information. An AI-generated
    // impostor and an obscure single edit both score 1.0 on title and artist,
    // identically to the real upload. Popularity is the tiebreaker that matches
    // what a person would pick: the canonical recording is the one with orders
    // of magnitude more plays.
    const views = await fetchViewCounts(token, eligible.map((c) => c.id));
    return eligible
      .sort((a, b) =>
        ((views.get(b.id) ?? 0) - (views.get(a.id) ?? 0)) ||
        (b.precision - a.precision) ||
        (b.artistScore - a.artistScore)
      )[0].id;
  };

  // 1. Broad search. Resolves the large majority of tracks for one search, and
  //    nothing below runs when it succeeds.
  const direct = await pickTopic(await runQuery(`${t} ${primaryArtist}`));
  if (direct) return direct;

  // 2. Escalate: find the artist's Topic channel and search inside it.
  //
  //    Scoping to the channel guarantees the artist structurally instead of
  //    scoring it, so an impostor or a same-name song by someone else cannot
  //    appear at all. It also rescues the common case where the artist is
  //    spelled differently on their channel than in the source playlist, which
  //    makes including the artist in a broad query actively suppress the right
  //    result.
  //
  //    Deliberately conditional. Doing this for every track would cost an extra
  //    search each and roughly double a conversion, which is unaffordable at
  //    ~100 searches/day — and would be worst on exactly the diverse playlists
  //    this app exists for. The channel id is cached across users and runs, so
  //    repeat artists escalate for the price of one in-channel search.
  const channelId = await findArtistTopicChannel(supabase, token, primaryArtist, channelCache);
  if (channelId) {
    // Every result is already on the right Topic channel, so the artist gate in
    // pickTopic is satisfied by construction; the title gates still apply.
    const scoped = await pickTopic(await runQuery(t, channelId));
    if (scoped) return scoped;
  }

  // 3. Last resort: title-only broad search. The artist still has to corroborate
  //    through the channel name in pickTopic, so this widens recall without
  //    loosening the quality bar.
  return await pickTopic(await runQuery(t));
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
    data?: Array<{
      id: string;
      attributes?: {
        url?: string;
        // `globalId` is the *catalog* id for this playlist when one exists.
        // Catalog playlists are web-addressable; library ids are not — see
        // integrations/apple-music.md "Library playlist IDs are not deep links".
        // So this is an identifier Apple handed us, not a URL we invented.
        playParams?: { globalId?: string };
      };
    }>;
  };
  const playlist = payload.data?.[0];
  if (!playlist?.id) return null;
  let canonicalUrl = playlist.attributes?.url ?? null;

  // A private library playlist usually has no globalId, so this often stays
  // null and the existing chain runs as before. Costs nothing to check.
  const globalId = playlist.attributes?.playParams?.globalId;
  if (!canonicalUrl && globalId) {
    // No storefront segment: Apple redirects a storefront-less catalog URL to
    // the viewer's own store, which is what we want anyway.
    canonicalUrl = `https://music.apple.com/playlist/${globalId}`;
    console.log(`[convert-playlist] Apple playlist URL resolved from playParams.globalId: ${canonicalUrl}`);
  }

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
    isrc?: string | null;
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
  // Artist -> Topic channel id, for the run. Backed by artist_channels, so this
  // only avoids re-reading the table within a single conversion.
  const artistChannelCache = new Map<string, string | null>();

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
      // Cheapest first, and each step is exact until the last one.
      //   1. cache        — already resolved by someone, free
      //   2. carried id   — the share already names this track on the
      //                     destination service, free
      //   3. ISRC         — one request, identifies the exact recording
      //   4. search       — a guess, and the only step that can be wrong
      id = cached
        ?? (primaryService === 'spotify' ? track.spotify_id
          : primaryService === 'youtube_music' ? track.youtube_music_id
          : track.apple_music_id)
        ?? null;

      if (!id && track.isrc && (primaryService === 'spotify' || primaryService === 'apple_music')) {
        id = await lookupByIsrc(primaryService, track.isrc, accessToken, appleDeveloperToken, storefront);
      }

      if (!id) {
        if (primaryService === 'spotify') {
          id = await searchSpotify(accessToken, track.title, track.artist);
        } else if (primaryService === 'youtube_music') {
          id = await searchYouTube(accessToken, track.title, track.artist, supabase, artistChannelCache);
        } else if (primaryService === 'apple_music' && appleDeveloperToken) {
          id = await searchAppleMusic(
            appleDeveloperToken,
            accessToken,
            storefront,
            track.title,
            track.artist,
          );
        }
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
    // Distinguish "searched and found nothing" from "never got to search".
    // When the daily quota is already spent the very first track trips it and
    // every later one is skipped, which lands here with zero matches — and
    // reporting that as "no tracks could be matched" is the same misleading
    // message this function used to give for auth failures. It is retryable
    // tomorrow, which is the one thing the user needs to know.
    if (quotaExhausted) {
      return json({ error: `${primaryService}_quota_exceeded`, quotaExhausted: true }, 429);
    }
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
