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

## Share Pickers Need Fresh Follow Data

**Problem**: A user who had just become a mutual follow did not appear in the playlist/song share picker immediately.

**Root cause**: The share pickers owned their own `useFollows()` instance and only fetched follow data on mount, so a modal that was already mounted could show a stale mutual-follow list.

**Fix**: Refresh follow data when share UI opens. `FriendPickerModal` now calls `refresh()` on open, and `LibraryPlaylistDetailModal` refreshes follows before showing its inline picker.

---

## YouTube Channel Name Pollution

**Problem**: YouTube channel names for official tracks include ` - Topic` suffix (e.g. "Drake - Topic"). Using this as a search query on Spotify/Apple Music returns bad results.

**Fix**: `cleanArtistName()` in `lib/utils.ts` strips the suffix before cross-platform search.

---

## AudD "skip" Was Wired To The Wrong Endpoint

**Problem**: The reel importer logged multiple AudD timestamp checks, but every request kept identifying the same middle-of-video song.

**Root cause**: `skip`-style chunk scanning is documented for AudD's enterprise endpoint, not the standard `api.audd.io` endpoint. The old code was POSTing the reel URL to the standard endpoint, so the offset logging did not correspond to real per-chunk scanning.

**Fix**: Use `https://enterprise.audd.io/` with `skip_first_seconds` (and `limit=1`) for each requested offset. This makes the reel importer fingerprint the intended section of the video instead of repeatedly sampling the same chunk.

---

## Reel Import False Positives Need Cross-Source Ranking

**Problem**: Treating every AudD or OCR match as equally trustworthy polluted reel imports with tracks that were never actually in the reel. Typical failures were:
- AudD confidently returning the same intro/interlude track across adjacent chunks
- OCR inferring a famous song from album art or cover text before the real song title appeared

**Root cause**: The raw source outputs are not equally reliable. AudD can overfit short transitional audio, and OCR can hallucinate when it sees album covers, artist photos, or playlist-style frames instead of explicit title+artist overlays.

**Fix**:
- Return raw reel evidence buckets separately (`audioSongs`, `metadataSong`, `textSongs`) instead of trusting one pre-merged list
- Rank on the client by confidence and corroboration rather than auto-keeping every audio hit
- Penalize standalone intro/interlude-style titles unless another source supports them
- In the vision prompt, require that both song title and artist name are directly readable on-screen and explicitly forbid album-cover inference
- When canonicalizing OCR hits, allow small title typos instead of requiring an exact normalized iTunes match; otherwise, good frame reads like `Seigiried` get dropped before they ever reach the client

**Rule**: For reel imports, use cross-source evidence and order hints. Do not treat a single confident source as ground truth by default.

---

## Reel OCR Should Be A Fallback, Not A Blind Skip

**Problem**: Reel import got accurate enough, but still felt too slow on simple reels with only one or a few songs because the client always paid for expensive frame extraction + Claude OCR whenever the initial merged count was below a fixed threshold.

**Fix**:
- When OCR is needed, scan late frames first because that is where missing songs usually are after audio has already covered the beginning
- Add a middle-frame OCR pass for short, text-heavy reels. Early+late alone can still miss fast title cards in the middle of the reel
- Only run the early-frame OCR pass if the late pass still leaves obvious gaps
- Stop OCR batches early after consecutive empty batches
- Do not use a separate fast-track skip heuristic. A reel having "enough" initial audio hits is not proof that OCR is unnecessary, especially on dense multi-song reels where the Instagram audio is unrelated to the on-screen tracklist. The safe trigger is still whether the initial merged result is thin.
- For reels where each song card is only visible for about 1-2 seconds, use denser frame spacing and smaller OCR batches. Sparse sampling and large multi-frame batches will miss cards or cause Claude to collapse multiple songs into one answer.
- For very short dense reels, a single dense full-timeline OCR sweep is better than staged late/middle/early passes. When every 1-2 seconds shows a new card, full coverage matters more than prioritizing one section of the reel.

**Rule**: For reel import, keep the expensive vision pass staged, but trigger it off missing evidence rather than off assumptions about reel simplicity.

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

## Apple Music Library IDs Are Not Deep Links

**Problem**: Apple Music library playlist IDs are not safe to turn into guessed `music.apple.com/library/playlist/{id}` URLs. A playlist can be created successfully, but opening that guessed URL can still land in Apple Music's "item not available" screen.

**Fix**:
- Capture the canonical playlist URL returned by Apple Music in `attributes.url`
- If the create-playlist response omits `attributes.url`, fetch the created library playlist once more to resolve it
- If the library playlist still has no direct URL, check its `catalog` relationship for a catalog playlist URL
- If Apple exposes no direct playlist URL at all, fall back to opening the Apple Music Library instead of pretending the raw library playlist ID is deep-linkable
- Return that URL from the playlist-creation path / conversion edge function
- Build `music://` + `https://` deep links from the canonical URL instead of from the raw library ID

**Rule**: For Apple Music handoff, prefer canonical URLs returned by Apple over manufactured URL patterns whenever the API provides them. Private library playlists may not be directly deep-linkable.

---

## Related Pages

[[integrations/spotify]] · [[integrations/youtube-music]] · [[playlist-conversion]]
