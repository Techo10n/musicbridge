# Knowledge Base Log

Append-only. Each entry records what changed and why.

---

## 2026-04-07 — Initial population

Created knowledge base from project files, README, SETUP.md, IDEAS.md, CLAUDE.md, and session memory.

**Files created**:
- `index.md` — hub/index
- `project-overview.md` — what MusicBridge is
- `architecture.md` — system design + design tokens
- `file-structure.md` — repo layout
- `database.md` — Supabase schema
- `auth.md` — auth system (Supabase + streaming service OAuth)
- `features.md` — all implemented features + IDEAS backlog
- `playlist-conversion.md` — how cross-platform conversion works
- `roadmap.md` — phased plan + IDEAS.md backlog
- `preferences.md` — Zech's preferences and style
- `mistakes-and-learnings.md` — bugs and lessons from past sessions
- `integrations/spotify.md` — Spotify API functions, rate limits, scopes
- `integrations/apple-music.md` — deferred status + re-enable notes
- `integrations/youtube-music.md` — music filtering, LM vs LL, search heuristic
- `log.md` — this file

## 2026-04-07 — Fix YouTube Music returning remixes/live versions instead of canonical recording

**Files changed**: `lib/youtubeMusic.ts`

- Added `norm`, `isBadVariant`, `titleScore`, `pickBestTopicResult` helpers above `searchTrack`.
- `isBadVariant` uses `\b` word-boundary regex to detect remix/live/acoustic/etc. qualifiers that appear in a result title but not the search title. Safe for songs whose actual name contains those words (e.g. "Live and Let Die").
- `titleScore` scores 0–4: exact → prefix → contains → 70% word overlap → poor.
- Both phases now use `pickBestTopicResult` instead of returning the first Topic-channel hit.
- Phase 2 in-channel search bumped to `maxResults=10` to give scoring more candidates.
- Updated `mistakes-and-learnings.md`.

## 2026-04-07 — Fix YouTube Music showing songs as videos (strict Topic-only)

**Files changed**: `lib/youtubeMusic.ts`, `app/(tabs)/home.tsx`

- Rewrote `searchTrack` with a two-phase strategy and no fallback to non-Topic videos. Phase 1: three parallel queries. Phase 2: direct Topic-channel lookup + in-channel title search. Throws `youtube_music_topic_not_found` with detailed logs on failure.
- Changed return type from `Promise<string | null>` to `Promise<string>` (throws on miss).
- `home.tsx` now shows a specific "not available as a YouTube Music Song" alert for the new error code instead of the generic "something went wrong".
- Updated `mistakes-and-learnings.md`.

## 2026-04-07 — Expand and reorganize IDEAS.md

**Files changed**: `IDEAS.md`, `knowledge-base/roadmap.md`

- Rewrote IDEAS.md from 4 bare bullet-points into 8 categorized sections.
- Recovered ideas referenced in previous sessions but never written back into IDEAS.md (Music Stories, For You feed, taste compatibility, streaks, Wrapped stats, Song of the Day, deep link previews, explore page, gamification, etc.).
- Added new ideas inspired by Instagram, TikTok, and Snapchat: music polls, group listening rooms, music personality type, friend blend, QR code profiles, music trivia.
- Updated roadmap.md Ideas Log summary to match the expanded list.

## 2026-04-07 — Profile overhaul: Instagram-style UI, follows system, stats

**Files created**: `supabase/migrations/004_follows_and_profile.sql`, `hooks/useFollows.ts`, `hooks/useProfileStats.ts`, `lib/avatarUpload.ts`

**Files updated**: `types/index.ts`, `lib/spotify.ts`, `lib/youtubeMusic.ts`, `app/(tabs)/profile.tsx`, `app/(tabs)/friends.tsx`, `components/FriendListItem.tsx`, `components/FriendPickerModal.tsx`, `IDEAS.md`, `knowledge-base/features.md`, `knowledge-base/roadmap.md`

- **Migration 004**: Dropped `friendships` table + `friendship_status` enum. Created `follows` table (directed, no approval). Added `bio TEXT` and `favorite_song JSONB` to `users`. Created `avatars` Supabase Storage bucket with public read + per-user write RLS.
- **Follows system**: `useFollows` hook replaces `useFriends`. Directed Instagram-style model — instant follow, no pending state. `FriendListItem` updated to follow/unfollow button. Friends tab renamed "People", now has Following/Followers tabs.
- **Profile tab**: Full Instagram-style redesign — avatar (tappable, uploads to Supabase Storage via `expo-image-picker`), bio (inline edit), followers/following/shared stats row, favorite song picker, taste tags, Wrapped stats card, Top Artists + Top Songs horizontal scrolls, Pinned Playlists (AsyncStorage, up to 3), Listening History (Spotify-only, opt-in).
- **Spotify**: Added `getTopTracks`, `getTopArtists`, `getRecentlyPlayed` functions. Added `user-top-read` and `user-read-recently-played` scopes (existing users need to re-auth).
- **YouTube Music**: Added `getSubscribedChannels` (subscriptions.list). Added `analyzeYouTubeLibrary` — derives top artists from liked video channel frequency, returns liked count + playlist count as stats proxy. No taste tags for YouTube (no genre data in API).
- **useProfileStats hook**: Detects active service, fetches appropriate data, derives taste tags from Spotify genres, manages pinned playlists and history opt-in via AsyncStorage.
- Removed "music personality type" from IDEAS.md per user preference.

## 2026-04-07 — Fix Liked Songs streaming not showing all tracks

**Files changed**: `components/LibraryPlaylistDetailModal.tsx`, `hooks/useLibrary.ts`

- Added `streamingMore` state to `LibraryPlaylistDetailModal`. Shows a footer spinner while pages are still being fetched after the first 50 tracks appear. Previously: spinner disappeared after first page, user could close modal before streaming finished.
- Fixed `useLibrary.getPlaylistTracks` calling non-existent `Spotify.getSavedTracks`. Now wraps `streamSavedTracks` as a synchronous collector.
- Updated `mistakes-and-learnings.md` with this incident.

## 2026-04-16 — Fix YouTube Music artist extraction (IIP-DDS distributor channels)

**Files changed**: `lib/youtubeMusic.ts`, `components/ShareModal.tsx`

- `videoOwnerChannelTitle` for K-drama OST tracks uploaded by IIP-DDS distributor showed channel name ("release") instead of performing artist.
- Built a multi-stage artist extraction pipeline with zero hardcoded names:
  1. Parse `"Artist - Song"` from video title (regex with spaces around dash)
  2. If title yields a show/album name (OST/Part/Season/Episode keywords), recover from video description
  3. Description recovery: IIP-DDS pipe format (`Song · Artist` segment), `아티스트:` field, `Performed by`, first 5 lines `"Artist - Song"` pattern
  4. Fall back to cleaned channel title (`cleanChannelToArtist`: strips " - Topic" and "VEVO")
- `batchGetVideoMeta` extended to also return `description` and `tags` (no extra API cost — added to existing `videos.list` call).
- `ShareModal` uses `extractYouTubeTrackInfo` for search result artist names (was using raw `channelTitle`).
- Updated `mistakes-and-learnings.md`.

## 2026-04-16 — Push notifications

**Files created**: `supabase/migrations/005_push_tokens.sql`, `supabase/functions/send-notification/index.ts`, `lib/notifications.ts`, `hooks/useNotifications.ts`

**Files updated**: `hooks/useAuth.tsx`, `hooks/useFollows.ts`, `components/ReelImportModal.tsx`

- `push_tokens` table: unique `(user_id, token)`, RLS owner-only. Upserted on login, deleted on sign-out.
- `send-notification` edge function: verifies JWT, reads all tokens for recipient, POSTs batch to Expo Push API (`https://exp.host/--/api/v2/push/send`).
- `lib/notifications.ts`: `registerForPushNotifications` (requests permission, upserts token), `unregisterPushToken` (delete on sign-out), `sendPushNotification` (calls edge function).
- `useNotifications`: calls register on login; `addNotificationResponseReceivedListener` navigates to `/(tabs)/home` for `new_share`, `/(tabs)/friends` for `new_follower`.
- Fires on: new share received, new follower.

## 2026-04-16 — Instagram Reel import

**Files created**: `lib/reelParser.ts`, `hooks/useClipboardReel.ts`, `components/ReelImportBanner.tsx`, `components/ReelImportModal.tsx`, `supabase/functions/parse-reel/index.ts`

**Files updated**: `app/_layout.tsx`

- Clipboard polling (`expo-clipboard` + `AppState`) detects Instagram reel URLs. `seenUrls` ref prevents re-showing after dismiss. Works in Expo Go without native build.
- `ReelImportBanner`: slim top bar with platform icon + "Find Song" button, shown on all authenticated screens.
- `ReelImportModal`: calls `parse-reel` edge function; shows song card + friend picker + message input on success; auto-closes after 2s on failure.
- `parse-reel` edge function — two-stage pipeline:
  - Stage 1: Instagram `?__a=1&__d=dis` scrape with mobile user-agent + `X-Ig-App-Id: 936619743392459`. Handles Format A (`clips_metadata.music_info.music_asset_info`) and Format B (`graphql.shortcode_media.clips_music_attribution_info`).
  - Stage 2: AudD audio fingerprinting via `AUDD_API_TOKEN` Supabase secret — POSTs CDN video URL directly to AudD.
- TikTok URL patterns pre-defined in `reelParser.ts`; edge function only handles Instagram today.
- **Deployment**: `supabase functions deploy parse-reel --no-verify-jwt` + `supabase secrets set AUDD_API_TOKEN=<token>`

## 2026-04-17 — Reel import fixes: real AudD offsets, frame OCR, direct YTM open

**Files changed**: `components/ReelImportModal.tsx`, `supabase/functions/parse-reel/index.ts`, `package.json`, `package-lock.json`, `README.md`, `knowledge-base/features.md`, `knowledge-base/mistakes-and-learnings.md`

- Fixed a false-positive caption parse: free-form lines like `"playlist - let me know"` no longer get treated as `Song - Artist`. Caption parsing now only accepts structured, song-like patterns.
- Switched AudD from the standard endpoint to `enterprise.audd.io` and uses `skip_first_seconds` per request so timestamped scans actually hit different parts of the reel.
- Removed thumbnail-only vision from the edge function. `ReelImportModal` now extracts multiple frames from the reel video on-device with `expo-video-thumbnails`, then sends those frames back for OCR.
- Vision prompt now ignores hashtags, playlist labels, and generic mood text unless a frame explicitly shows a song title + artist pair.
- Reel song taps now use the same resolve-and-deeplink flow as the home feed, so YouTube Music accounts open the canonical song player instead of dropping the query into YTM search.

## 2026-04-17 — Reel import confidence ranking and OCR anti-inference

**Files changed**: `components/ReelImportModal.tsx`, `supabase/functions/parse-reel/index.ts`, `lib/youtubeMusic.ts`, `README.md`, `knowledge-base/integrations/youtube-music.md`, `knowledge-base/mistakes-and-learnings.md`

- Removed the remaining Jimi Hendrix-specific aliasing. YouTube Music search and reel matching are back to generic title/artist heuristics only.
- `parse-reel` now aggregates enterprise AudD chunk hits into canonicalized `audioSongs` with `matchCount` and `orderHint` instead of treating every chunk match as an independent final song.
- `ReelImportModal` now ignores the edge function's broad merged song list and ranks raw evidence buckets locally. Audio-only intros/interludes are penalized, corroborated songs are preferred, repeated vision hits get boosted, and final ordering now prefers earliest observed reel position.
- Strengthened the Claude OCR prompt so it only returns songs when both title and artist are directly readable in the frame text, explicitly forbidding guesses from album art, vinyl sleeves, artist photos, and playlist-style frames.

## 2026-04-17 — Reel OCR canonicalization tolerates small title typos

**Files changed**: `supabase/functions/parse-reel/index.ts`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- `canonicalizeTrack` now falls back to a small Levenshtein-based title similarity check when artist matches but the OCR title is slightly misspelled.
- This fixes cases where Claude reads the right song with a minor typo, such as `Seigiried` instead of `Seigfried`, and the edge function was previously dropping the track before the client could rank it.

## 2026-04-17 — Reel import fast path for simple reels

**Files changed**: `components/ReelImportModal.tsx`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Added a fast path that skips OCR entirely when metadata/audio already provides a high-confidence low-song-count result.
- When OCR is needed, `ReelImportModal` now scans late frames first and only pays for the early-frame pass if the late pass still leaves gaps.
- OCR batch collection now stops after consecutive empty batches, which trims wasted Claude calls on reels where the remaining frames are not yielding new songs.
- Tightened the skip condition after testing: the fast path now only bypasses OCR for clearly small, high-confidence reels instead of using a broad “enough songs found already” heuristic.
- Tightened it further: OCR now only gets skipped for genuinely tiny reels (about 20-25 seconds or shorter) with at most one or two strong initial songs.

## 2026-04-17 — Remove reel OCR fast-skip heuristic

**Files changed**: `components/ReelImportModal.tsx`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Reverted the separate fast-track skip logic after it incorrectly suppressed OCR on dense reels whose on-screen text listed many songs while the Instagram audio only matched one unrelated track.
- Restored the pre-fast-track trigger: if the initial merged metadata/audio/text result is still thin, run OCR.
- Kept the staged OCR structure itself: late frames first, early frames only if needed, and early stopping after consecutive empty batches.

## 2026-04-17 — Denser OCR sampling for 1-2 second song cards

**Files changed**: `components/ReelImportModal.tsx`, `supabase/functions/parse-reel/index.ts`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Increased late-frame and early-frame sampling density so fast-changing reels capture more intermediate title cards.
- Reduced OCR batch sizes (late: 3 frames, early: 2 frames) so Claude is less likely to compress several adjacent song cards into one answer.
- Trimmed noisy Instagram debug output by removing the full media-key dump and shortening caption logging to a preview.

## 2026-04-18 — Add middle OCR pass for dense short reels

**Files changed**: `components/ReelImportModal.tsx`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Added a middle-range OCR pass between the late and early passes so short reels with many 1-2 second title cards do not miss the middle third of the timeline.
- Assigned separate order-hint bands to early, middle, and late OCR batches so merged song ordering better reflects where the card actually appeared in the reel.
