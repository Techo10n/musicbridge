# YouTube Music Integration

**File**: `lib/youtubeMusic.ts`  
**API**: YouTube Data API v3  
**Status**: Active

---

## Key Behaviors

**Music-only filtering**: All library data is restricted to `videoCategoryId=10` (Music). Items are fetched then batch-checked via `/videos?id=...`. Playlists whose first video isn't Music category are excluded.

**Liked Music vs Liked Videos**: Library uses playlist ID `LM` (YouTube Music "Liked Music"), NOT `LL` (YouTube "Liked Videos"). `LM` avoids non-music videos.

**Search heuristic**: Filter to `topicId=/m/04rlf` + `videoCategoryId=10`. Prefer "Artist - Topic" channels (official audio). Deprioritize titles with "music video", "lyric", "live", "official video".

**Artist name cleaning**: Strip ` - Topic` suffix from YouTube channel names via `cleanArtistName()` in `lib/utils.ts` before using as search query on other platforms.

---

## Functions

| Function | Notes |
|---|---|
| `connectYouTubeMusic` | PKCE via Google OAuth |
| `getYouTubeAccessToken` | Auto-refresh |
| `searchTrack` | For conversion — music topic filtered |
| `searchTracks` | Free-form, up to 25 results |
| `createPlaylist` | POST playlist, then POST each video individually |
| `getUserPlaylists` | Mine=true, batch-check first video per playlist |
| `getPlaylistTracks` | paginated, music-only |
| `getLikedMusic` | Playlist ID `LM`, music-only |

---

## Related Pages

[[auth]] · [[playlist-conversion]] · [[mistakes-and-learnings]]
