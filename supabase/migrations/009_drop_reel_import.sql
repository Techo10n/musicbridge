-- Drop the Instagram/TikTok reel-import schema.
--
-- The reel song-identification feature moved out of Museaic into SongScraper,
-- which owns this data now (see its migrations 003/004). Nothing in this app
-- reads these objects any more, so they are removed here.
--
-- Destructive: this deletes any reel lists still stored in this database.
-- Migrations 006 and 007 are retained as applied history.

drop function if exists public.upsert_reel_import_songs(uuid, jsonb);

-- reel_import_songs rows cascade from reel_imports, but drop explicitly so the
-- order is not dependent on the FK definition.
drop table if exists public.reel_import_songs;
drop table if exists public.reel_imports;
