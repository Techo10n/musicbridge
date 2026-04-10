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
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    .replace(/[\(\[](remaster(ed)?|remastered \d{4}|\d{4} remaster|deluxe|anniversary|expanded|bonus track|radio edit|single version|album version|feat\.[^\)\]]*|ft\.[^\)\]]*)[\)\]]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Token management ─────────────────────────────────────────────────────────

async function refreshSpotifyToken(
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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

async function searchSpotify(token: string, title: string, artist: string): Promise<string | null> {
  const t = cleanTitle(title);
  const a = cleanArtistName(artist);

  const doSearch = async (rawQuery: string): Promise<string | null> => {
    const q = encodeURIComponent(rawQuery);
    let retries = 0;
    while (retries <= 3) {
      const res = await fetch(
        `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : 2000 * (retries + 1);
        if (wait > 15_000) throw new Error('spotify_rate_limit_exceeded');
        await new Promise((r) => setTimeout(r, wait));
        retries++;
        continue;
      }
      if (!res.ok) return null;
      const data = await res.json();
      return data.tracks?.items?.[0]?.id ?? null;
    }
    return null;
  };

  // Prefer field-filter query; fall back to plain keyword if zero results
  return (await doSearch(`track:${t} artist:${a}`)) ?? (await doSearch(`${t} ${a}`));
}

async function searchYouTube(token: string, title: string, artist: string): Promise<string | null> {
  const t = cleanTitle(title);
  const a = cleanArtistName(artist);
  const q = encodeURIComponent(`${t} ${a}`);

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?q=${q}&type=video&part=snippet,id&maxResults=10&videoCategoryId=10&topicId=/m/04rlf`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;

  const data = await res.json();
  const items: Array<{ id: { videoId: string }; snippet: { title: string; channelTitle: string; description?: string } }> =
    data.items ?? [];

  const best =
    items.find((i) => {
      const ch = i.snippet.channelTitle?.toLowerCase() ?? '';
      const vt = i.snippet.title?.toLowerCase() ?? '';
      const desc = i.snippet.description?.toLowerCase() ?? '';
      return (
        ch.endsWith(' - topic') ||
        vt.includes('official audio') ||
        desc.includes('provided to youtube')
      );
    }) ??
    items.find((i) => {
      const vt = i.snippet.title?.toLowerCase() ?? '';
      return (
        !vt.includes('music video') &&
        !vt.includes('lyric') &&
        !vt.includes('live') &&
        !vt.includes('official video')
      );
    }) ??
    items[0];

  return best?.id?.videoId ?? null;
}

// ─── Playlist creation ────────────────────────────────────────────────────────

async function createSpotifyPlaylist(
  token: string,
  name: string,
  trackIds: string[],
): Promise<string | null> {
  // Use /v1/me/playlists — simpler than /v1/users/{id}/playlists and avoids
  // an extra /v1/me round-trip to look up the user ID.
  const createRes = await fetch('https://api.spotify.com/v1/me/playlists', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, public: false, description: 'Shared via MusicBridge' }),
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

  if (trackIds.length > 0) {
    // Spotify allows max 100 URIs per request — batch if needed
    const uris = trackIds.map((id) => `spotify:track:${id}`);
    for (let i = 0; i < uris.length; i += 100) {
      const batch = uris.slice(i, i + 100);
      const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: batch }),
      });
      if (!addRes.ok) {
        const errText = await addRes.text().catch(() => '(unreadable)');
        console.error(`[convert-playlist] Spotify add tracks failed (batch ${i}): ${addRes.status} ${errText}`);
        // Don't abort — playlist was created, partial tracks is better than nothing
      }
    }
  }

  return playlist.id;
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
        snippet: { title: name, description: 'Shared via MusicBridge' },
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
      'primary_service, spotify_access_token, spotify_refresh_token, spotify_token_expiry, youtube_access_token, youtube_refresh_token, youtube_token_expiry',
    )
    .eq('id', authUser.id)
    .single();

  if (recipientErr || !recipient) {
    console.error('[convert-playlist] recipient fetch failed:', recipientErr?.message);
    return json({ error: 'Recipient profile not found' }, 404);
  }

  const primaryService: string = recipient.primary_service;

  if (primaryService === 'apple_music') {
    return json({ error: 'Apple Music playlist conversion is not yet supported.' }, 400);
  }

  // Resolve access token (refreshing if expired)
  let accessToken: string | null = null;
  if (primaryService === 'spotify') {
    accessToken = await getSpotifyToken(supabase, authUser.id, recipient);
  } else if (primaryService === 'youtube_music') {
    accessToken = await getYouTubeToken(supabase, authUser.id, recipient);
  }

  if (!accessToken) {
    const hasToken = primaryService === 'spotify'
      ? !!recipient.spotify_access_token
      : !!recipient.youtube_access_token;
    const errMsg = hasToken ? 'spotify_token_refresh_failed' : 'not_connected';
    console.error(`[convert-playlist] No access token for ${primaryService}. hasToken=${hasToken}, errMsg=${errMsg}`);
    await supabase.from('shared_items').update({ conversion_status: 'failed' }).eq('id', sharedItemId);
    return json({ error: errMsg }, 400);
  }

  // Mark as processing so the client's realtime subscription fires immediately
  await supabase
    .from('shared_items')
    .update({ conversion_status: 'processing', tracks_processed: 0 })
    .eq('id', sharedItemId);

  // ── Resolve track IDs ──────────────────────────────────────────────────────

  const tracks = item.tracks as Array<{
    title: string;
    artist: string;
    spotify_id: string | null;
    youtube_music_id: string | null;
  }>;

  const resolvedIds: string[] = [];

  try {
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      let id: string | null = null;

      if (primaryService === 'spotify') {
        id = track.spotify_id ?? await searchSpotify(accessToken, track.title, track.artist);
      } else if (primaryService === 'youtube_music') {
        id = track.youtube_music_id ?? await searchYouTube(accessToken, track.title, track.artist);
      }

      if (id) resolvedIds.push(id);

      // Update progress after every track so the client sees a smooth counter
      await supabase
        .from('shared_items')
        .update({ tracks_processed: i + 1 })
        .eq('id', sharedItemId);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown';
    await supabase
      .from('shared_items')
      .update({ conversion_status: 'failed' })
      .eq('id', sharedItemId);
    const status = msg === 'spotify_rate_limit_exceeded' ? 429 : 500;
    return json({ error: msg }, status);
  }

  if (resolvedIds.length === 0) {
    await supabase
      .from('shared_items')
      .update({ conversion_status: 'failed' })
      .eq('id', sharedItemId);
    return json({ error: 'No tracks could be matched on the destination service' }, 422);
  }

  console.log(`[convert-playlist] Resolved ${resolvedIds.length}/${tracks.length} tracks for ${primaryService}`);

  // ── Create the playlist ────────────────────────────────────────────────────

  let playlistId: string | null = null;
  if (primaryService === 'spotify') {
    playlistId = await createSpotifyPlaylist(accessToken, item.title, resolvedIds);
  } else if (primaryService === 'youtube_music') {
    playlistId = await createYouTubePlaylist(accessToken, item.title, resolvedIds);
  }

  if (!playlistId) {
    console.error(`[convert-playlist] Playlist creation returned null for service=${primaryService}`);
    await supabase.from('shared_items').update({ conversion_status: 'failed' }).eq('id', sharedItemId);
    return json({ error: 'playlist_creation_failed' }, 500);
  }

  // ── Write playlist ID and mark done ───────────────────────────────────────

  const playlistUpdate: Record<string, string> = { conversion_status: 'done' };
  if (primaryService === 'spotify') playlistUpdate.spotify_playlist_id = playlistId;
  else if (primaryService === 'youtube_music') playlistUpdate.youtube_music_playlist_id = playlistId;

  await supabase.from('shared_items').update(playlistUpdate).eq('id', sharedItemId);

  return json({ playlistId, matchedTracks: resolvedIds.length, totalTracks: tracks.length });
});
