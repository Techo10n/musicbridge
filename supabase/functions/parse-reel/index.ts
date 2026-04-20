import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AUDD_API = 'https://enterprise.audd.io/';
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';

const IG_GRAPHQL_ENDPOINT = 'https://www.instagram.com/api/graphql';
const IG_GRAPHQL_DOC_ID_FALLBACK = '10015901848480474';
const IG_LSD = 'AVqbxe3J_YA';

const IG_GRAPHQL_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Content-Type': 'application/x-www-form-urlencoded',
  'X-IG-App-ID': '936619743392459',
  'X-FB-LSD': IG_LSD,
  'X-ASBD-ID': '129477',
  'Sec-Fetch-Site': 'same-origin',
  'Referer': 'https://www.instagram.com/',
  'Origin': 'https://www.instagram.com',
};

interface ReelSong {
  title: string;
  artist: string;
  coverUrl: string | null;
}

interface DownloadedVideo {
  bytes: Uint8Array;
  contentType: string;
}

interface AuddSongCandidate {
  score?: number;
  artist?: string;
  title?: string;
  spotify?: { album?: { images?: Array<{ url: string }> } };
  apple_music?: { artwork?: { url: string } };
}

interface OrderedReelSong extends ReelSong {
  orderHint: number;
  matchCount: number;
}

const debugNotes: string[] = [];
let loggedMalformedAuddResult = false;
function dbg(msg: string) {
  console.log(`[parse-reel] ${msg}`);
  debugNotes.push(msg);
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanTitleForMatch(title: string | null | undefined): string {
  return normalize(
    (title ?? '')
      .replace(/\((?:[^)]*(?:remaster|live|intro|outro|version|edit|mix)[^)]*)\)/gi, '')
      .replace(/\[(?:[^\]]*(?:remaster|live|intro|outro|version|edit|mix)[^\]]*)\]/gi, ''),
  );
}

function cleanArtistForMatch(artist: string | null | undefined): string {
  return normalize(
    (artist ?? '')
      .replace(/^the\s+/i, '')
      .replace(/\s+-\s+topic$/i, ''),
  );
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function titleSimilarityScore(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const distance = levenshtein(a, b);
  const longest = Math.max(a.length, b.length);
  return longest > 0 ? 1 - distance / longest : 0;
}

function areEquivalentSongs(a: ReelSong, b: ReelSong): boolean {
  const titleA = cleanTitleForMatch(a.title);
  const titleB = cleanTitleForMatch(b.title);
  if (!titleA || !titleB || titleA !== titleB) return false;

  const artistA = cleanArtistForMatch(a.artist);
  const artistB = cleanArtistForMatch(b.artist);
  if (!artistA || !artistB) return false;
  if (artistA === artistB) return true;

  const tokensA = new Set(artistA.split(' ').filter(Boolean));
  const tokensB = new Set(artistB.split(' ').filter(Boolean));
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  return overlap >= 2;
}

const SONG_CONTEXT_HINT_RE =
  /\b(tracklist|song|songs|ost|soundtrack|np|now playing|currently playing|playlist|id\??|music)\b/i;
const NATURAL_LANGUAGE_RE =
  /\b(i|you|we|they|he|she|it|my|your|our|their|let|know|want|need|love|promise|perfect|study(?:ing)?|chilling|playlist)\b/i;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function looksLikeStructuredSongPair(left: string, right: string, originalLine: string): boolean {
  const leftWords = wordCount(left);
  const rightWords = wordCount(right);
  if (leftWords === 0 || rightWords === 0) return false;
  if (leftWords > 8 || rightWords > 6) return false;
  if (NATURAL_LANGUAGE_RE.test(left) || NATURAL_LANGUAGE_RE.test(right)) return false;
  if (/#/.test(left) || /#/.test(right)) return false;
  if (/[.!?]{2,}/.test(left) || /[.!?]{2,}/.test(right)) return false;

  return SONG_CONTEXT_HINT_RE.test(originalLine)
    || /^[\d]+[.)]\s*/.test(originalLine)
    || /^[•\-→*]/.test(originalLine)
    || /^[🎵🎶🎸🎤♪♫]/.test(originalLine)
    || (leftWords <= 5 && rightWords <= 4);
}

function deduplicateSongs(songs: ReelSong[]): ReelSong[] {
  const deduped: ReelSong[] = [];
  for (const song of songs) {
    const existingIndex = deduped.findIndex((existing) => areEquivalentSongs(existing, song));
    if (existingIndex === -1) {
      deduped.push(song);
      continue;
    }

    const existing = deduped[existingIndex];
    const existingScore = (existing.coverUrl ? 1 : 0) + existing.title.length + existing.artist.length;
    const nextScore = (song.coverUrl ? 1 : 0) + song.title.length + song.artist.length;
    if (nextScore > existingScore) {
      deduped[existingIndex] = { ...existing, ...song, coverUrl: song.coverUrl ?? existing.coverUrl };
    } else if (!existing.coverUrl && song.coverUrl) {
      deduped[existingIndex] = { ...existing, coverUrl: song.coverUrl };
    }
  }
  return deduped;
}

async function enrichSongCover(song: ReelSong): Promise<ReelSong> {
  if (song.coverUrl) return song;

  try {
    const term = encodeURIComponent(`${song.title} ${song.artist}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5`);
    if (!res.ok) return song;

    const data = await res.json() as {
      results?: Array<{
        trackName?: string;
        artistName?: string;
        artworkUrl100?: string;
      }>;
    };

    const match = (data.results ?? []).find((result) =>
      normalize(result.trackName ?? '') === normalize(song.title)
      && normalize(result.artistName ?? '').includes(normalize(song.artist)),
    ) ?? data.results?.[0];

    if (!match?.artworkUrl100) return song;
    return {
      ...song,
      coverUrl: match.artworkUrl100.replace(/100x100bb/i, '400x400bb'),
    };
  } catch {
    return song;
  }
}

async function enrichSongCovers(songs: ReelSong[]): Promise<ReelSong[]> {
  return Promise.all(songs.map(enrichSongCover));
}

async function canonicalizeTrack(song: ReelSong): Promise<ReelSong | null> {
  try {
    const cleanedTitle = cleanTitleForMatch(song.title);
    const cleanedArtist = cleanArtistForMatch(song.artist);
    if (!cleanedTitle || !cleanedArtist) return null;

    const term = encodeURIComponent(`${cleanedTitle} ${cleanedArtist}`);
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=10`);
    if (!res.ok) return null;

    const data = await res.json() as {
      results?: Array<{
        trackName?: string;
        artistName?: string;
        artworkUrl100?: string;
      }>;
    };

    const exact = (data.results ?? []).find((result) =>
      cleanTitleForMatch(result.trackName) === cleanedTitle
      && cleanArtistForMatch(result.artistName).includes(cleanedArtist),
    );

    const fuzzy = !exact
      ? (data.results ?? [])
        .map((result) => ({
          result,
          cleanedResultTitle: cleanTitleForMatch(result.trackName),
          cleanedResultArtist: cleanArtistForMatch(result.artistName),
        }))
        .filter(({ cleanedResultTitle, cleanedResultArtist }) =>
          cleanedResultArtist.includes(cleanedArtist)
          || cleanedArtist.includes(cleanedResultArtist),
        )
        .map(({ result, cleanedResultTitle }) => ({
          result,
          score: titleSimilarityScore(cleanedResultTitle, cleanedTitle),
        }))
        .filter(({ score }) => score >= 0.72)
        .sort((a, b) => b.score - a.score)[0]?.result
      : null;

    const best = exact ?? fuzzy;
    if (!best?.trackName || !best.artistName) return null;

    return {
      title: best.trackName,
      artist: best.artistName,
      coverUrl: best.artworkUrl100?.replace(/100x100bb/i, '400x400bb') ?? song.coverUrl,
    };
  } catch {
    return null;
  }
}

// ─── Text-based song parsing (caption + comments) ────────────────────────────

/**
 * Parses a block of text for multiple song/artist pairs.
 * Handles numbered lists, bullet lists, emoji prefixes, and inline patterns.
 * Used on the reel caption and pinned comments.
 */
function parseAllSongsFromText(text: string): { title: string; artist: string }[] {
  const songs: { title: string; artist: string }[] = [];
  const lines = text.split(/[\n|]/);

  for (const line of lines) {
    // Strip leading number/bullet markers
    const t = line
      .replace(/^[\d]+[.)]\s*/, '')
      .replace(/^[•\-→*]\s*/, '')
      .trim();
    if (!t || t.length < 5) continue;

    // Multi-line labeled (Artist:/Song: on same stripped line won't match — handled below)
    // Single: "Song - Artist" or "Artist - Song"
    const dash = t.match(/^(.+?)\s+[-–—]\s+(.+)$/);
    if (dash) {
      const left = dash[1].trim();
      const right = dash[2].trim();
      if (looksLikeStructuredSongPair(left, right, line.trim())) {
        songs.push({ title: left, artist: right });
      }
      continue;
    }

    // "Song by Artist"
    const by = t.match(/^(.+?)\s+by\s+(.+)$/i);
    if (by) {
      const left = by[1].trim();
      const right = by[2].trim();
      if (looksLikeStructuredSongPair(left, right, line.trim())) {
        songs.push({ title: left, artist: right });
      }
      continue;
    }

    // "🎵 Song - Artist" / "🎶 Song by Artist"
    const emoji = t.match(/^[🎵🎶🎸🎤♪♫]\s*(.+?)\s+(?:[-–—]|by)\s+(.+)$/i);
    if (emoji) {
      songs.push({ title: emoji[1].trim(), artist: emoji[2].trim() });
    }
  }

  // Also handle multi-line labeled blocks: "Artist: X\nSong: Y"
  const artistLine = text.match(/(?:^|\n)\s*artist[:\s]+(.+)/i)?.[1]?.trim();
  const songLine = text.match(/(?:^|\n)\s*song(?:\s+name)?[:\s]+(.+)/i)?.[1]?.trim();
  if (artistLine && songLine) {
    const alreadyAdded = songs.some(
      s => normalize(s.artist) === normalize(artistLine) && normalize(s.title) === normalize(songLine)
    );
    if (!alreadyAdded) songs.push({ artist: artistLine, title: songLine });
  }

  return songs;
}

// ─── Instagram GraphQL scrape ─────────────────────────────────────────────────

async function scrapeInstagramMetadata(shortcode: string): Promise<{
  song: ReelSong | null;
  videoUrl: string | null;
  videoDuration: number | null;
  caption: string;
  comments: string[];
}> {
  const docId = Deno.env.get('IG_GRAPHQL_DOC_ID') ?? IG_GRAPHQL_DOC_ID_FALLBACK;

  const params = new URLSearchParams({
    variables: JSON.stringify({ shortcode }),
    doc_id: docId,
    lsd: IG_LSD,
  });

  try {
    const res = await fetch(`${IG_GRAPHQL_ENDPOINT}?${params}`, {
      method: 'POST',
      headers: IG_GRAPHQL_HEADERS,
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      dbg(`Stage-IG: HTTP ${res.status} body: ${body}`);
      return { song: null, videoUrl: null, videoDuration: null, caption: '', comments: [] };
    }

    let data: Record<string, unknown>;
    try {
      data = await res.json() as Record<string, unknown>;
    } catch {
      dbg('Stage-IG: non-JSON response');
      return { song: null, videoUrl: null, videoDuration: null, caption: '', comments: [] };
    }

    const errors = data?.errors as unknown[] | undefined;
    if (Array.isArray(errors) && errors.length > 0) {
      dbg(`Stage-IG: GraphQL errors: ${JSON.stringify(errors).slice(0, 300)}`);
    }

    const media = (data?.data as Record<string, unknown> | undefined)
      ?.xdt_shortcode_media as Record<string, unknown> | undefined;

    if (!media) {
      dbg('Stage-IG: xdt_shortcode_media missing');
      return { song: null, videoUrl: null, videoDuration: null, caption: '', comments: [] };
    }

    const videoUrl = (media.video_url as string | undefined) ?? null;
    const rawDuration = media.video_duration;
    const videoDuration = typeof rawDuration === 'number' && Number.isFinite(rawDuration)
      ? rawDuration
      : null;

    // Caption
    const captionEdges = ((media.edge_media_to_caption as Record<string, unknown> | undefined)
      ?.edges as Array<Record<string, unknown>> | undefined) ?? [];
    const caption = (captionEdges[0]?.node as Record<string, unknown> | undefined)
      ?.text as string ?? '';
    dbg(`Stage-IG: caption length=${caption.length}`);
    if (caption) dbg(`Stage-IG: caption preview: "${caption.slice(0, 140).replace(/\s+/g, ' ')}${caption.length > 140 ? '…' : ''}"`);


    // Comments (preview_comments first, then edge_media_to_comment)
    const comments: string[] = [];
    const preview = media.preview_comments as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(preview)) {
      for (const c of preview) {
        if (typeof c.text === 'string' && c.text.trim()) {
          c.is_pinned ? comments.unshift(c.text) : comments.push(c.text);
        }
      }
    }
    const commentEdges = ((media.edge_media_to_comment as Record<string, unknown> | undefined)
      ?.edges as Array<Record<string, unknown>> | undefined) ?? [];
    for (const edge of commentEdges) {
      const node = edge.node as Record<string, unknown> | undefined;
      if (typeof node?.text === 'string' && node.text.trim() && !comments.includes(node.text)) {
        node.is_pinned ? comments.unshift(node.text) : comments.push(node.text);
      }
    }
    dbg(`Stage-IG: ${comments.length} comment(s)`);

    // Licensed track metadata (Format B)
    const attr = media.clips_music_attribution_info as Record<string, unknown> | undefined;
    if (attr) {
      dbg(`Stage-IG: attr — uses_original=${attr.uses_original_audio}, song="${attr.song_name}", artist="${attr.artist_name}"`);
    }

    const song = (attr && !attr.uses_original_audio && attr.song_name && attr.artist_name)
      ? { title: attr.song_name as string, artist: attr.artist_name as string, coverUrl: null }
      : null;

    return { song, videoUrl, videoDuration, caption, comments };
  } catch (err) {
    dbg(`Stage-IG: exception: ${err}`);
    return { song: null, videoUrl: null, videoDuration: null, caption: '', comments: [] };
  }
}

// ─── AudD multi-segment fingerprinting ───────────────────────────────────────

async function downloadVideoForFingerprinting(videoUrl: string): Promise<DownloadedVideo | null> {
  try {
    dbg(`Stage-Audio: downloading video for file upload ${videoUrl.slice(0, 80)}…`);
    const res = await fetch(videoUrl);
    if (!res.ok) {
      dbg(`Stage-Audio: video download HTTP ${res.status}`);
      return null;
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'video/mp4';
    dbg(`Stage-Audio: downloaded ${(bytes.byteLength / (1024 * 1024)).toFixed(2)}MB (${contentType})`);
    return { bytes, contentType };
  } catch (err) {
    dbg(`Stage-Audio: video download failed: ${err}`);
    return null;
  }
}

function toReelSong(candidate: AuddSongCandidate | null | undefined): ReelSong | null {
  const title = typeof candidate?.title === 'string' ? candidate.title.trim() : '';
  const artist = typeof candidate?.artist === 'string' ? candidate.artist.trim() : '';
  if (!title || !artist) return null;

  let coverUrl: string | null = null;
  if (candidate?.spotify?.album?.images?.[0]?.url) {
    coverUrl = candidate.spotify.album.images[0].url;
  } else if (candidate?.apple_music?.artwork?.url) {
    coverUrl = candidate.apple_music.artwork.url.replace('{w}', '300').replace('{h}', '300');
  }

  return { title, artist, coverUrl };
}

function pickBestEnterpriseSong(result: unknown): ReelSong | null {
  if (!Array.isArray(result)) return null;

  const candidates: AuddSongCandidate[] = [];
  for (const chunk of result) {
    const songs = (chunk as { songs?: unknown })?.songs;
    if (!Array.isArray(songs)) continue;
    for (const song of songs) {
      candidates.push(song as AuddSongCandidate);
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  for (const candidate of candidates) {
    const parsed = toReelSong(candidate);
    if (parsed) return parsed;
  }

  return null;
}

async function fingerprintSegment(
  video: DownloadedVideo,
  token: string,
  offsetSeconds: number,
): Promise<ReelSong | null> {
  try {
    const body = new FormData();
    body.append('api_token', token);
    body.append('return', 'apple_music,spotify');
    body.append('accurate_offsets', 'true');
    body.append('skip_first_seconds', String(offsetSeconds));
    body.append('limit', '1');
    body.append(
      'file',
      new Blob([video.bytes], { type: video.contentType }),
      'reel.mp4',
    );

    const res = await fetch(AUDD_API, {
      method: 'POST',
      body,
    });

    if (!res.ok) { dbg(`AudD offset=${offsetSeconds}s: HTTP ${res.status}`); return null; }

    const data = await res.json() as {
      status: string;
      error?: { error_code: number; error_message: string };
      result?: unknown;
    };

    if (data.status !== 'success' || !data.result) {
      const reason = data.error ? `code=${data.error.error_code} "${data.error.error_message}"` : 'no match';
      dbg(`AudD offset=${offsetSeconds}s: ${reason}`);
      return null;
    }

    const song = pickBestEnterpriseSong(data.result);
    if (!song) {
      if (!loggedMalformedAuddResult) {
        loggedMalformedAuddResult = true;
        dbg(`AudD malformed result sample: ${JSON.stringify(data.result).slice(0, 500)}`);
      }
      dbg(`AudD offset=${offsetSeconds}s: success response but no valid song fields`);
      return null;
    }

    dbg(`AudD offset=${offsetSeconds}s: "${song.title}" by "${song.artist}"`);
    return song;
  } catch (err) {
    dbg(`AudD offset=${offsetSeconds}s: exception: ${err}`);
    return null;
  }
}

async function fingerprintWholeVideo(
  videoUrl: string,
  token: string,
): Promise<OrderedReelSong[]> {
  const downloadedVideo = await downloadVideoForFingerprinting(videoUrl);
  if (!downloadedVideo) return [];

  try {
    const body = new FormData();
    body.append('api_token', token);
    body.append('return', 'apple_music,spotify');
    body.append('accurate_offsets', 'true');
    body.append('limit', '100');
    body.append(
      'file',
      new Blob([downloadedVideo.bytes], { type: downloadedVideo.contentType }),
      'reel.mp4',
    );

    dbg('Stage-Audio: single enterprise scan across full reel');
    const res = await fetch(AUDD_API, {
      method: 'POST',
      body,
    });

    if (!res.ok) {
      dbg(`Stage-Audio: enterprise scan HTTP ${res.status}`);
      return [];
    }

    const data = await res.json() as {
      status: string;
      error?: { error_code: number; error_message: string };
      result?: unknown;
    };

    if (data.status !== 'success' || !Array.isArray(data.result)) {
      const reason = data.error ? `code=${data.error.error_code} "${data.error.error_message}"` : 'unexpected result';
      dbg(`Stage-Audio: enterprise scan failed: ${reason}`);
      return [];
    }

    const results: OrderedReelSong[] = [];
    for (const chunk of data.result as Array<{ offset?: number; songs?: unknown }>) {
      const parsed = pickBestEnterpriseSong([{ songs: chunk.songs }]);
      if (!parsed) continue;
      dbg(`AudD chunk offset=${chunk.offset ?? 'unknown'}s: "${parsed.title}" by "${parsed.artist}"`);
      results.push({
        ...parsed,
        orderHint: typeof chunk.offset === 'number' ? chunk.offset : Number.MAX_SAFE_INTEGER,
        matchCount: 1,
      });
    }

    if (results.length === 0 && !loggedMalformedAuddResult) {
      loggedMalformedAuddResult = true;
      dbg(`AudD malformed result sample: ${JSON.stringify(data.result).slice(0, 500)}`);
    }

    const aggregated: OrderedReelSong[] = [];
    for (const song of results) {
      const existing = aggregated.find((candidate) => areEquivalentSongs(candidate, song));
      if (!existing) {
        aggregated.push(song);
        continue;
      }

      existing.matchCount += 1;
      existing.orderHint = Math.min(existing.orderHint, song.orderHint);
      if (!existing.coverUrl && song.coverUrl) existing.coverUrl = song.coverUrl;
      if (cleanTitleForMatch(song.title).length < cleanTitleForMatch(existing.title).length) {
        existing.title = song.title;
      }
      if (cleanArtistForMatch(song.artist).length < cleanArtistForMatch(existing.artist).length) {
        existing.artist = song.artist;
      }
    }

    const canonicalized = (await Promise.all(
      aggregated.map(async (song) => {
        const canonical = await canonicalizeTrack(song);
        return {
          ...(canonical ?? song),
          orderHint: song.orderHint,
          matchCount: song.matchCount,
        };
      }),
    )).sort((a, b) => a.orderHint - b.orderHint);

    dbg(`Stage-Audio: ${canonicalized.length} unique song(s) found`);
    return canonicalized;
  } catch (err) {
    dbg(`Stage-Audio: enterprise scan exception: ${err}`);
    return [];
  }
}

// ─── Vision: client-extracted frames + Claude Haiku ──────────────────────────

async function extractSongsFromFrames(
  frames: string[],
): Promise<{ title: string; artist: string }[]> {
  if (frames.length === 0) return [];

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) { dbg('Stage-Vision: ANTHROPIC_API_KEY not set — skipping'); return []; }

  try {
    const imageContent = frames.map(f => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: f },
    }));

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: 'These are sequential frames from an Instagram reel. Return songs ONLY when the frame text itself explicitly shows both the song title and the artist name. Do not infer from album covers, cover art, artist photos, vinyl sleeves, tracklists, aesthetic text, captions, hashtags, playlist names, genres, or partial text. If you only see an album name or recognizable cover, do not guess the song. Return ONLY valid JSON — an array of objects like [{"title":"Song Name","artist":"Artist Name"}]. If the title+artist pair is not directly readable on-screen, return [].',
            },
          ],
        }],
      }),
    });

    const data = await res.json() as { content?: Array<{ type: string; text: string }> };
    const text = data.content?.find(c => c.type === 'text')?.text ?? '[]';
    dbg(`Stage-Vision: Claude response: ${text.slice(0, 300)}`);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) { dbg('Stage-Vision: no JSON array in response'); return []; }

    const parsed = JSON.parse(jsonMatch[0]) as { title: string; artist: string }[];
    dbg(`Stage-Vision: ${parsed.length} song(s) from frames`);
    return parsed;
  } catch (err) {
    dbg(`Stage-Vision: failed: ${err}`);
    return [];
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  debugNotes.length = 0;
  loggedMalformedAuddResult = false;

  const jsonResp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const authHeader = req.headers.get('Authorization');
    const jwt = authHeader?.replace('Bearer ', '');
    if (!jwt) return jsonResp({ error: 'unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: authError } = await supabase.auth.getUser(jwt);
    if (authError) return jsonResp({ error: 'unauthorized' }, 401);

    const body = await req.json() as {
      url?: string;
      frames?: string[];
      vision_only?: boolean;
    };
    const clientFrames = Array.isArray(body.frames)
      ? body.frames.filter((frame): frame is string => typeof frame === 'string' && frame.length > 0)
      : [];
    const visionOnly = body.vision_only === true;

    if (!visionOnly && !body.url) return jsonResp({ error: 'missing url' }, 400);

    if (visionOnly) {
      dbg(`Stage-Vision: ${clientFrames.length} client frame(s) provided`);
      const visionSongs = await extractSongsFromFrames(clientFrames);
      const canonicalVisionSongs = (await Promise.all(
        visionSongs.map((song) => canonicalizeTrack({ ...song, coverUrl: null })),
      )).filter((song): song is ReelSong => !!song);
      const allSongs = deduplicateSongs(canonicalVisionSongs);
      const source = allSongs.length > 0 ? 'vision' : 'none';
      dbg(`RESULT: ${allSongs.length} song(s) via [${source}]`);
      return jsonResp({ songs: allSongs, source, debug: debugNotes });
    }

    const shortcodeMatch = body.url!.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/);
    if (!shortcodeMatch) return jsonResp({ error: 'invalid_url' }, 400);
    const shortcode = shortcodeMatch[1];
    dbg(`shortcode: ${shortcode}`);

    // ── Stage 0: Instagram metadata + caption/comment text parsing ───────────
    const { song: igSong, videoUrl, videoDuration, caption, comments } = await scrapeInstagramMetadata(shortcode);

    const captionSongs = caption ? parseAllSongsFromText(caption) : [];
    dbg(`Stage-Text: caption yielded ${captionSongs.length} song(s)`);

    const commentSongs = comments.flatMap(c => parseAllSongsFromText(c));
    dbg(`Stage-Text: comments yielded ${commentSongs.length} song(s)`);

    // ── Stage 1: AudD multi-segment audio fingerprinting ────────────────────
    const auddToken = Deno.env.get('AUDD_API_TOKEN');
    let audioSongs: OrderedReelSong[] = [];
    if (videoUrl && auddToken) {
      audioSongs = await fingerprintWholeVideo(videoUrl, auddToken);
    } else {
      if (!videoUrl) dbg('Stage-Audio: skipped — no video URL');
      if (!auddToken) dbg('Stage-Audio: skipped — AUDD_API_TOKEN not set');
    }

    // ── Stage 2: Vision OCR on client-extracted frames ──────────────────────
    let visionSongs: { title: string; artist: string }[] = [];
    if (clientFrames.length > 0) {
      dbg(`Stage-Vision: using ${clientFrames.length} client frame(s)`);
      visionSongs = await extractSongsFromFrames(clientFrames);
    } else {
      dbg('Stage-Vision: skipped — no client frames provided');
    }

    // ── Merge all sources ────────────────────────────────────────────────────
    const allSongs = await enrichSongCovers(deduplicateSongs([
      ...(igSong ? [igSong] : []),
      ...captionSongs.map(s => ({ ...s, coverUrl: null })),
      ...commentSongs.map(s => ({ ...s, coverUrl: null })),
      ...audioSongs,
      ...visionSongs.map(s => ({ ...s, coverUrl: null })),
    ]));

    const sources = [
      igSong && 'metadata',
      (captionSongs.length > 0 || commentSongs.length > 0) && 'text',
      audioSongs.length > 0 && 'fingerprint',
      visionSongs.length > 0 && 'vision',
    ].filter(Boolean);

    const source = allSongs.length > 0 ? sources.join('+') : 'none';
    dbg(`RESULT: ${allSongs.length} song(s) via [${source}]`);

    return jsonResp({
      songs: allSongs,
      audioSongs,
      metadataSong: igSong,
      textSongs: deduplicateSongs([
        ...captionSongs.map(s => ({ ...s, coverUrl: null })),
        ...commentSongs.map(s => ({ ...s, coverUrl: null })),
      ]),
      source,
      debug: debugNotes,
      videoUrl,
      videoDuration,
    });
  } catch (err) {
    const msg = `unexpected error: ${err}`;
    console.error(`[parse-reel] ${msg}`);
    return new Response(
      JSON.stringify({ error: 'internal_error', debug: [...debugNotes, msg] }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
