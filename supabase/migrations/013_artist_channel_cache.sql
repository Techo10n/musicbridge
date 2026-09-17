-- ============================================================
-- MusicBridge — Migration 013: Artist Topic-channel cache
--
-- When a broad YouTube search turns up no acceptable candidate, the next-best
-- move is to find the artist's official "<artist> - Topic" channel and search
-- inside it: the artist is then guaranteed structurally rather than scored, so
-- an impostor or a same-name song by someone else cannot appear at all.
--
-- That costs an extra search (100 quota units) to locate the channel. Doing it
-- for every track would roughly double the cost of a conversion, which is
-- unaffordable against a ~100-search daily budget — and it would be worst
-- exactly on the diverse "songs you have never heard" playlists this app is
-- for, where almost every artist is distinct.
--
-- So the lookup happens only on escalation, and the result is cached here. A
-- channel id is a stable, public fact about an artist, so it is shared across
-- all users like track_matches (migration 012).
-- ============================================================

create table if not exists public.artist_channels (
  service    text        not null,   -- 'youtube_music'
  artist_key text        not null,   -- normalized artist name
  channel_id text        not null,
  created_at timestamptz not null default now(),
  primary key (service, artist_key)
);

comment on table public.artist_channels is
  'Cache of resolved artist channel ids (YouTube "<artist> - Topic"). Exists so escalating to a channel-scoped search does not re-spend a search on locating the same channel.';

alter table public.artist_channels enable row level security;

-- Public catalogue facts, not user data — same reasoning as track_matches.
create policy artist_channels_read on public.artist_channels
  for select to authenticated using (true);

create policy artist_channels_insert on public.artist_channels
  for insert to authenticated with check (true);

-- Channels are renamed and occasionally replaced; an entry must be correctable
-- rather than wrong forever.
create policy artist_channels_update on public.artist_channels
  for update to authenticated using (true) with check (true);
