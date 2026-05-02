-- Store the canonical Apple Music playlist URL returned by MusicKit when it is
-- available so already-converted shared playlists can open directly later.
alter table public.shared_items
  add column if not exists apple_music_playlist_url text;
