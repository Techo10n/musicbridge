# Playlist Conversion

## How It Works

Triggered when recipient taps "Add to [service]" in `PlaylistModal.tsx`. Runs entirely on recipient's device.

1. Fetch playlist tracks from `shared_items` metadata
2. For each track: call `searchTrack()` on recipient's primary service
3. Collect matched track IDs
4. Call `createPlaylist()` → add all matched tracks
5. Update `shared_items.conversion_status` + `tracks_processed`

Also available as a Supabase Edge Function (`supabase/functions/convert-playlist/`) for server-side execution with progress updates.

---

## Track Matching Strategy

- Query: `"<title> <artist>"` against target service search
- Spotify: retry up to 3× on 429, respect `Retry-After`, bail if wait > 15s
- YouTube: prefer "Artist - Topic" channels, deprioritize live/lyric/MV results
- Apple Music: deferred

---

## Known Limitations

- Track matching is approximate — exact match not guaranteed
- Regional availability may cause some tracks to not exist on target service
- Apple Music recipients cannot receive conversions (deferred)
- Large playlists may hit rate limits on Spotify developer quota

---

## Related Pages

[[integrations/spotify]] · [[integrations/youtube-music]] · [[integrations/apple-music]] · [[mistakes-and-learnings]]
