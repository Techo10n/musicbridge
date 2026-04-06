-- ============================================================
-- MusicBridge — Migration 002: Playlist Conversion Progress
-- Adds real-time progress tracking columns to shared_items so
-- the convert-playlist Edge Function can report status back to
-- the client via Supabase Realtime.
-- ============================================================

alter table public.shared_items
  add column if not exists conversion_status text not null default 'idle',
  add column if not exists tracks_processed  integer not null default 0;

-- Allowed values for conversion_status:
--   'idle'       — conversion not yet started
--   'processing' — edge function is actively working
--   'done'       — playlist created successfully
--   'failed'     — conversion encountered an error

-- No new RLS policies needed: the existing shared_items_update_recipient
-- policy already allows the recipient (who triggers the edge function with
-- their own JWT) to update any column on their shared_items rows.
