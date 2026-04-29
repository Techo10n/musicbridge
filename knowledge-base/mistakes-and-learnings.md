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

## Reel Clipboard State Should Not Leak Across Accounts

**Problem**: The iOS paste permission prompt could appear, but the reel banner still would not show after switching accounts and testing the same reel again. This was especially confusing when comparing behavior across Spotify / Apple Music / YouTube Music accounts in one app session.

**Root cause**: `useClipboardReel` kept its dismissed URL cache in memory for the lifetime of the root layout. The cache was not reset when the signed-in user changed, so one account could suppress the same reel for the next account. The reel UI was also mounted only when `primary_service` existed, which was stricter than the intended "authenticated user" behavior. A second issue showed up after loosening that gate: the reel flow could start during auth/profile hydration, which made Supabase requests race the still-settling session during account switches.

**Fix**: Scope clipboard reel state to the current signed-in user. Clear `seenUrls`, `pendingUrl`, and `pendingSource` whenever the auth user changes, mount the reel banner/modal for any authenticated loaded user instead of requiring `primary_service`, and delay reel polling / reel-function calls until auth hydration is complete. The reel function now also sends the current bearer token explicitly after a short session-readiness retry.

---

## Storage-Backed Avatars Need Local Preview And Cache Busting

**Problem**: Picking a new profile image could succeed but still leave the old avatar on screen, which looked like the upload failed. The picker also emitted an Expo deprecation warning because it still used `ImagePicker.MediaTypeOptions`.

**Root cause**: The UI waited on the remote storage URL to be visible before showing anything new, while the stored avatar file path stayed stable and could still be cached. The picker call also used Expo's deprecated enum wrapper instead of the current `mediaTypes` shape.

**Fix**: Use the current image-picker API (`mediaTypes: ['images']`), upload avatar bytes as an `ArrayBuffer` with `cacheControl: '0'`, append a cache-busting query param to the public URL, and show the picked local image immediately on the profile screen while the refreshed profile row catches up.

---

## Manual Safe-Area Spacers Drift Out Of Sync

**Problem**: The library playlists started rendering much lower on the screen than intended, leaving a large empty band above the content.

**Root cause**: The screen used a hard-coded top spacer (`safeTop: 52`) instead of a real safe-area wrapper. Once the rest of the tab layout evolved, that manual spacer no longer matched the actual device inset and header sizing.

**Fix**: Wrap the library screen in `SafeAreaView` with `edges={['top']}` and remove the manual spacer. Use real safe-area primitives for top layout instead of guessed pixel offsets.

---

## Horizontal ScrollViews Need Explicit Height Constraints

**Problem**: The library filter rail still occupied a huge vertical block even after fixing the top spacer, pushing the actual playlist list down the screen.

**Root cause**: In React Native, a horizontal `ScrollView` inside a vertical flex layout can still expand vertically if its own height/flex behavior is left implicit. The chip content looked like the problem, but the actual offender was the scroll container.

**Fix**: Constrain the horizontal filter `ScrollView` itself (`flexGrow: 0`, bounded height) and align its content vertically. When a row of chips looks absurdly tall, inspect the scroll container before redesigning the chips.

---

## Library Search Needs Bounded Playlist Indexing

**Problem**: Searching only top-level playlist names misses songs inside playlists, but fetching every track from every playlist can be expensive and slow on large libraries.

**Fix**: Let playlist-track loaders accept an optional max-track cap, then preload a bounded slice per playlist for library search/indexing while keeping playlist detail modals uncapped. Use the indexed slice for search text and display counts when a service does not provide playlist counts in list responses.

**Rule**: For cross-service library search, keep background indexing bounded and leave full pagination to explicit detail views.

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

## YouTube Music Must Not Guess From Artist Alone

**Problem**: A reel/import result could show the right song in MusicBridge, but tapping it on YouTube Music opened the wrong track by the same artist. Example: searching for `1111` by `HANRORO` incorrectly accepted a different HANRORO Topic-track.

**Root cause**: The YTM title matcher normalized titles with an ASCII-only regex. Non-Latin titles could collapse to an empty string, and the prefix/contains checks then accidentally treated the empty string as a strong match. The picker also allowed Topic candidates with zero title match as long as the artist score was high enough.

**Fix**: Preserve Unicode letters/numbers during normalization, return `0` when either normalized title is empty, and reject Topic candidates whose title score is `0`. If title matching fails, prefer throwing `youtube_music_topic_not_found` over opening the wrong song.

---

## Debounced Search Effects Need Stable Callbacks

**Problem**: Auto-populating search UIs can accidentally re-fire their debounce effect on every render if the async search function is recreated inline and also listed as an effect dependency.

**Root cause**: The debounce looked correct, but the callback identity changed after each `setState`, which retriggered the effect and produced extra searches.

**Fix**: Wrap async search handlers used by debounced `useEffect` hooks in `useCallback` and keep the dependency list explicit. This keeps type-ahead search responsive without turning every state update into another network call.

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

## Visible Touch Targets Need Explicit Outcomes

**Problem**: Several visible buttons and rows had either no `onPress` handler or an empty handler, which made the UI feel broken even when the intended product feature was not ready yet.

**Fix**: Wire obvious actions to real behavior and route ambiguous/deferred features to a clear placeholder alert. Track those placeholders in `IDEAS.md` so they are not forgotten.

**Rule**: A visible touch target must either perform the action, open a relevant empty/placeholder state, or clearly explain that the feature is not currently available.

---

## Related Pages

[[integrations/spotify]] · [[integrations/youtube-music]] · [[playlist-conversion]]
