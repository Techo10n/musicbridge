# Mistakes & Learnings

## Spotify Rate Limits

**Problem**: Developer-mode Spotify quota is much tighter than production. Hitting rate limits during playlist creation/search caused long hangs.

**Fix**: `searchTrack` retries up to 3× respecting `Retry-After`. If wait > 15s → throw `spotify_rate_limit_exceeded` immediately rather than waiting. Streaming `getSavedTracks` added to avoid loading all tracks at once.

---

## Pagination Missing Initially

**Problem**: `getUserPlaylists` and `getSavedTracks` only fetched the first page (50 items), silently missing the rest of large libraries.

**Fix**: Both functions now paginate through all pages.

---

## YouTube "Liked Videos" vs "Liked Music"

**Problem**: Using playlist ID `LL` (Liked Videos) pulled in non-music videos, polluting the library.

**Fix**: Use `LM` (Liked Music) instead. Also batch-check all items against `/videos?id=...` to filter to `categoryId=10` (Music).

---

## Spotify Scopes Insufficient for Library

**Problem**: Added library feature but forgot to include `user-library-read` and `user-follow-read` in the OAuth scope. Existing connected users couldn't access library features without re-authing.

**Lesson**: When adding features that need new OAuth scopes, existing users must re-authenticate. Communicate this clearly.

---

## YouTube Channel Name Pollution

**Problem**: YouTube channel names for official tracks include ` - Topic` suffix (e.g. "Drake - Topic"). Using this as a search query on Spotify/Apple Music returns bad results.

**Fix**: `cleanArtistName()` in `lib/utils.ts` strips the suffix before cross-platform search.

---

---

## Liked Songs Streaming — No In-Progress Indicator

**Problem**: `streamSavedTracks` sets `loadingTracks=false` after the first 50 songs, hiding the spinner. The user sees 50 songs, no loading indicator, and may close the modal thinking it's done — which sets `cancelled=true` and stops streaming. Remaining pages are never fetched.

**Fix**: Added `streamingMore` state. After first page `loadingTracks=false` (FlatList shows), but `streamingMore` stays `true` until all pages complete. A small spinner renders in the FlatList footer while `streamingMore=true`.

**Also fixed**: `useLibrary.getPlaylistTracks` was calling non-existent `Spotify.getSavedTracks`. Now wraps `streamSavedTracks` as a collector.

---

## Related Pages

[[integrations/spotify]] · [[integrations/youtube-music]] · [[playlist-conversion]]
