# Features

## Built and Working

### Screens
- **home** — feed of received shared items; pull-to-refresh; song tap → deep link; playlist tap → PlaylistModal
- **friends** — friends/pending tabs, username search, send/accept/decline requests, share button
- **library** — playlists (tap to open detail), saved songs/liked videos (share per song), followed artists (Spotify only, horizontal scroll)
- **profile** — connect/disconnect each service, set primary service, sign out
- **login / register** — email+password; 2-step registration (credentials → primary service)

### Components
- `SongCard` / `PlaylistCard` — unread state (bold + left border)
- `PlaylistModal` — track list + "Add to [service]" conversion
- `ShareModal` — search primary service, pick friend, send
- `LibraryPlaylistDetailModal` — per-track share (paper-plane icon) + "Share Playlist with Friend" footer
- `FriendPickerModal` — reusable, resolves friend from `Friendship` requester/addressee
- `ServiceBadge` / `MusicServiceButton`

### Library (hooks/useLibrary.ts)
- Fetches playlists, saved tracks, followed artists
- `getPlaylistTracks(playlistId)` — lazy track loading on modal open

### Playlist Conversion
- Client-side by default; also available as Edge Function (`supabase/functions/convert-playlist/`)
- Progress tracked via `conversion_status` + `tracks_processed` on `shared_items`

---

## Not Yet Built (from IDEAS.md)

- Share Instagram Reels with music to the app → add songs to a playlist
- Collaborative cross-platform playlists (create in app, accessible on each user's own service)
- Real-time "what friends are listening to"
- Profiles showing top songs and artists

See [[roadmap]] for phased plan.

---

## Related Pages

[[architecture]] · [[playlist-conversion]] · [[roadmap]]
