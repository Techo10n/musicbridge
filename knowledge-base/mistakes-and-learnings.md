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

## YouTube Music Shows Songs as Videos / "(audio)" Titles

**Problem**: Songs shared/added to YouTube Music playlists rendered as videos (widescreen thumbnail, video player) instead of songs (square album art). Sometimes with confusing "(audio)" in the title.

**Root cause**: Only videos from **"Artist - Topic"** auto-generated YouTube channels render as Songs in YouTube Music. The old `searchTrack` ran a single search and fell back to non-Topic videos (VEVO, user uploads, etc.) when no Topic result appeared in the first 10 hits.

**Fix**: `searchTrack` now runs in two phases with no fallback to non-Topic videos. Both phases use `pickBestTopicResult` which applies two filters before selecting:
1. `isBadVariant(resultTitle, searchTitle)` — uses `\b` word-boundary regex to detect remix/live/acoustic/cover/etc. qualifiers that appear in the result but NOT in the original search title. Filters these out first. Remaining pool is used for scoring.
2. `titleScore(resultTitle, searchTitle)` — 0–4 score: exact match (4) → prefix (3) → contains (2) → ≥70% word overlap (1) → poor (0). Picks highest score from the clean pool.

- **Phase 1**: three parallel queries → `pickBestTopicResult` on combined results.
- **Phase 2**: direct Topic-channel channel lookup → in-channel search (maxResults=10) → `pickBestTopicResult`.
- **On failure**: throws `youtube_music_topic_not_found` with all rejected non-Topic candidates logged.

**Key rule**: If `channelTitle` doesn't end with `" - Topic"`, YouTube Music renders it as a Video, not a Song. Never add non-Topic videos.

**Variant detection caveat**: `isBadVariant` only flags qualifiers absent from the *search* title — so searching for "Live and Let Die" or "Remix" (as an actual song title) won't falsely filter the canonical recording.

---

## Related Pages

[[integrations/spotify]] · [[integrations/youtube-music]] · [[playlist-conversion]]
