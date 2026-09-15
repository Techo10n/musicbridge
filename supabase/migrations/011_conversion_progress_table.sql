-- ============================================================
-- MusicBridge — Migration 011: Move conversion progress off shared_items
--
-- `shared_items` carries the whole playlist payload in a `tracks` jsonb column.
-- `convert-playlist` was writing `tracks_processed` to that same row once per
-- track, so a single N-track conversion produced N full-row rewrites (MVCC +
-- WAL, jsonb included), N realtime broadcasts of the entire row, and — because
-- `useSharedItems` refetches the whole inbox on any shared_items UPDATE — 2N
-- further queries that each returned every track blob the user owns. That
-- amplification is what exhausted the project's resources.
--
-- Progress is hot, high-frequency, throwaway state. It does not belong on the
-- same row as the payload. This moves it to a narrow side table so a progress
-- write touches only a few small columns and is broadcast to the one subscriber
-- that cares.
-- ============================================================

create table if not exists public.conversion_progress (
  shared_item_id  uuid primary key references public.shared_items(id) on delete cascade,
  status          text        not null default 'idle',
  tracks_processed integer    not null default 0,
  updated_at      timestamptz not null default now()
);

comment on table public.conversion_progress is
  'High-frequency playlist conversion progress. Kept off shared_items so per-track updates do not rewrite or broadcast the tracks jsonb payload.';

alter table public.conversion_progress enable row level security;

-- The recipient triggers the conversion with their own JWT, so they are the
-- only principal that needs to read or write progress for their items.
create policy conversion_progress_recipient_all on public.conversion_progress
  for all
  using (
    exists (
      select 1 from public.shared_items si
      where si.id = conversion_progress.shared_item_id
        and si.recipient_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shared_items si
      where si.id = conversion_progress.shared_item_id
        and si.recipient_id = auth.uid()
    )
  );

-- Realtime: the modal subscribes filtered on shared_item_id, which is the
-- primary key, so the default replica identity is sufficient.
alter publication supabase_realtime add table public.conversion_progress;

-- Carry over any in-flight progress before dropping the old column.
insert into public.conversion_progress (shared_item_id, status, tracks_processed)
select id, conversion_status, tracks_processed
from public.shared_items
where type = 'playlist'
on conflict (shared_item_id) do nothing;

-- `conversion_status` stays on shared_items: the inbox list needs it to show
-- "already in library", and it is written at most twice per conversion, which
-- is not what caused the write amplification. `tracks_processed` was the hot
-- field and is now redundant.
alter table public.shared_items drop column if exists tracks_processed;

-- ── Track count for list views ───────────────────────────────────────────────
-- The inbox list only ever needs `tracks.length` (PlaylistCard), but selecting
-- it meant pulling every track blob in the user's inbox. A stored generated
-- column lets the list read the count without touching the payload. Guarded by
-- jsonb_typeof so a non-array value can never fail the write; `tracks` is null
-- for song shares.
alter table public.shared_items
  add column if not exists tracks_count integer
  generated always as (
    case when jsonb_typeof(tracks) = 'array' then jsonb_array_length(tracks) end
  ) stored;
