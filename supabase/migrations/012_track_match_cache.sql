-- ============================================================
-- MusicBridge — Migration 012: Cross-user track match cache
--
-- Resolving a track to a destination service costs a search call, and on
-- YouTube that is 100 quota units against a default 10,000/day — roughly 100
-- tracks per day across every conversion and every user. A 130-track playlist
-- cannot finish in a day.
--
-- Almost all of that spend is repeat work: the same songs recur across
-- playlists and across users, and every conversion re-resolved them from
-- scratch. A resolution is not user-specific — "this title by this artist is
-- that YouTube video" is a fact about the catalogue — so it can be cached once
-- and reused by everyone.
--
-- Only *positive* matches are cached. A miss is not cached: a song absent today
-- may be uploaded tomorrow, and caching a miss would make that permanent.
-- ============================================================

create table if not exists public.track_matches (
  service     text        not null,   -- 'spotify' | 'youtube_music' | 'apple_music'
  match_key   text        not null,   -- normalized "<title>|<artist>"
  external_id text        not null,   -- the resolved id on that service
  created_at  timestamptz not null default now(),
  primary key (service, match_key)
);

comment on table public.track_matches is
  'Cache of resolved track ids, keyed by normalized title+artist. Exists to avoid re-spending search quota on songs already resolved by any user.';

alter table public.track_matches enable row level security;

-- Catalogue facts, not user data: any signed-in user may read and contribute.
-- There is deliberately no per-user column — the whole value is that one user''s
-- resolution saves everyone else the quota.
create policy track_matches_read on public.track_matches
  for select to authenticated using (true);

create policy track_matches_insert on public.track_matches
  for insert to authenticated with check (true);

-- Allow refreshing an entry that has gone stale (a video taken down, say)
-- rather than being stuck with a dead id forever.
create policy track_matches_update on public.track_matches
  for update to authenticated using (true) with check (true);

-- Lookups are always (service, match_key), which the primary key already
-- covers. This index serves cache maintenance — finding and pruning old
-- entries — which is the only other access pattern.
create index if not exists track_matches_created_idx
  on public.track_matches (created_at desc);
