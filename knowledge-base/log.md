# Knowledge Base Log

Append-only. Each entry records what changed and why.

---

## 2026-04-26 — Full pixel-perfect screen rebuilds + new functionality

Complete screen rebuilds matching the MusicBridge.html design exactly:
- **Home**: story tray (post/view stories), Inbox/Following/Mixes tabs, feed rows with cover art + service badge overlay + message bubbles, emoji reaction system (🔥❤️🤯😮) with picker and Supabase reactions table
- **People** (was Friends): taste match bars (color-coded by %), streak badges, Send button on mutual follows, Suggested tab
- **Library**: filter chips (All/Spotify/Apple/Saved/Friends), design-matched playlist list, reel lists section
- **Profile**: IG-style stats row, avatar with camera badge, bio + genre tags, service chips, favorite song banner, Wrapped stats card (2×2 grid), pinned playlists grid, "Public shares" list section with play button header
- **Settings**: new screen — edit profile bottom sheet, privacy/notification toggles, account/app sections

New functionality:
- **Stories**: `hooks/useStories.ts` + `components/StoryViewer.tsx` — post stories from home, view full-screen with hollow-circle segment progress, react with emoji, open in native service
- **Reactions**: `hooks/useReactions.ts` + inline emoji picker on every feed item (requires `shared_item_reactions` table)
- **Reel import pipeline**: 4-step visualization (metadata → audio fingerprint → frame OCR → confidence merge) with live best-match preview card
- **Playlist conversion**: cross-service diagram (source → shuffle → destination), live progress bar, per-track resolution status (matched/searching/queued)
- **`components/ui.tsx`**: shared design primitives (Avatar, AppBar, Chip, CoverArt, IconBtn, TasteBar, ServiceDot, etc.)

New Supabase tables needed (graceful fallback if missing):
- `stories` (id, user_id, song_title, song_artist, song_cover_url, service, caption, expires_at)
- `story_reactions` (story_id, user_id, emoji)
- `shared_item_reactions` (item_id, user_id, emoji)

---

## 2026-04-26 — Full UI redesign from Claude Design handoff

Implemented MusicBridge.html design across the entire app:
- **Design tokens**: added `lib/theme.ts` with warm near-black bg (`#1a1813`) and bluish-purple primary accent (`#7C5BF4`); all hardcoded `#0f0f0f`/`#1a1a1a`/`#fff` replaced with warm palette.
- **Tab bar**: redesigned from 4 tabs to 5 (Home, Library, Share, People, You); center Share tab is a purple pill with paper-plane icon; opens a CreateMenuModal bottom sheet. Created `app/(tabs)/share.tsx` as an empty route placeholder.
- **Branding**: Home screen header now shows musicbridge wave-mark logo (purple square + `∿` glyph) + inline unread count pill.
- **Cards**: SongCard/PlaylistCard unread indicator changed from white to purple; warm card background; slightly larger border-radius.
- **ReelImportBanner**: purple-bordered banner with purple "Find Song" button.
- **Buttons/CTAs**: primary action buttons app-wide changed from white → purple; auth screens, SaveProfile, AddToLibrary, Follow, etc.
- **All screens**: home, library, friends, profile, auth login/register, all modals (ShareModal, PlaylistModal, FriendPickerModal, LibraryPlaylistDetailModal, UserProfileModal, ReelImportModal) updated to warm palette.

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

## 2026-04-20 — Harden parse-reel edge function

**Files changed**: `supabase/functions/parse-reel/index.ts`, `hooks/useAuth.tsx`, `hooks/useFollows.ts`, `hooks/useNotifications.ts`, `lib/notifications.ts`, `components/ReelImportModal.tsx`, `app.json`

- **Per-request context**: Removed module-level `debugNotes`/`loggedMalformedAuddResult`/`dbg` (caused race conditions across concurrent Deno.serve requests). Now created fresh per request as a `RequestContext` object threaded through every function.
- **Video size cap**: `downloadVideoForFingerprinting` now checks `content-length` first and stream-reads with a running byte counter; aborts and returns null if the video exceeds 50 MB.
- **iTunes enrichment**: `enrichSongCover` now uses `AbortController` with a 5-second timeout; `enrichSongCovers` processes in batches of 3 instead of unbounded `Promise.all`.
- **Env var validation**: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are now checked before `createClient`; missing vars return `server_misconfigured` 500 rather than crashing with a non-null assertion.
- **Auth note**: `--no-verify-jwt` in the deploy command is intentional — the Supabase gateway skips its own JWT pre-check so the function can validate the token itself using the service role key (see handler lines). Auth IS enforced; the function returns 401 for missing or invalid JWTs.
- **Notification robustness**: `unregisterPushToken` wrapped in try/catch in `signOut`; `sendPushNotification` fire-and-forget in `followUser` gets `.catch()`; `handleNotificationResponse` calls in `useNotifications` guarded with `.catch()`; Supabase upsert in `registerForPushNotifications` now checks `response.error` instead of relying on try/catch.
- **Schema fix**: `cover_image_url` in `ReelImportModal` share insert now uses `|| null` instead of `?? ''` so missing covers store null rather than an empty string.
- **Android notification icon**: expo-notifications plugin icon updated to `./assets/android-icon-monochrome.png` (required all-white 96×96 PNG).

## 2026-04-18 — Add middle OCR pass for dense short reels

**Files changed**: `components/ReelImportModal.tsx`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Added a middle-range OCR pass between the late and early passes so short reels with many 1-2 second title cards do not miss the middle third of the timeline.
- Assigned separate order-hint bands to early, middle, and late OCR batches so merged song ordering better reflects where the card actually appeared in the reel.

## 2026-04-25 — Native Apple Music auth + storefront-aware links + signup connect prompt

**Files changed**: `modules/apple-music/index.ts`, `modules/apple-music/ios/AppleMusicModule.swift`, `modules/apple-music/ios/AppleMusicNative.podspec`, `lib/appleMusic.ts`, `app/(tabs)/home.tsx`, `components/ReelImportModal.tsx`, `components/LibraryPlaylistDetailModal.tsx`, `app/(auth)/register.tsx`, `README.md`, `IDEAS.md`, `knowledge-base/auth.md`, `knowledge-base/features.md`, `knowledge-base/integrations/apple-music.md`, `knowledge-base/preferences.md`, `knowledge-base/roadmap.md`

- Replaced the old browser-based Apple Music auth path with a native iOS Expo module that requests Apple Music permission and exchanges a server-signed developer token for a Music user token.
- Fixed Apple Music deep links to resolve against the recipient storefront and prefer canonical Apple Music song URLs before opening the app.
- Moved the initial “connect your default streaming service” prompt into the registration service-selection step so new users can connect before reaching Home.
- Removed the implemented signup-connect prompt idea from `IDEAS.md` and synced README + knowledge base notes to the current behavior.

## 2026-04-25 — Clear invalid Spotify tokens on refresh failure

**Files changed**: `lib/spotify.ts`, `README.md`, `knowledge-base/auth.md`, `knowledge-base/integrations/spotify.md`

- If Spotify returns a failed refresh response, the app now clears the stored Spotify tokens and treats the service as disconnected.
- This avoids repeated refresh attempts with a bad refresh token and makes the recovery path explicit: reconnect Spotify once.

## 2026-04-25 — Spotify reconnect popup on login

**Files changed**: `app/_layout.tsx`, `lib/spotify.ts`, `README.md`, `knowledge-base/auth.md`, `knowledge-base/features.md`, `knowledge-base/integrations/spotify.md`

- Added a persistent reconnect-required flag when Spotify refresh fails.
- On the next login, the app now shows a popup explaining that Spotify needs to be reconnected and can route the user directly to Profile.

## 2026-04-25 — Refresh mutual follows when share pickers open

**Files changed**: `components/FriendPickerModal.tsx`, `components/LibraryPlaylistDetailModal.tsx`, `README.md`, `knowledge-base/features.md`, `knowledge-base/mistakes-and-learnings.md`

- Fixed stale mutual-follow share targets by refreshing follow data whenever the reusable share picker opens.
- The inline playlist share picker now also refreshes follows right before showing mutual-follow share options.

## 2026-04-25 — Fix reel banner suppression across account switches

**Files changed**: `app/_layout.tsx`, `hooks/useClipboardReel.ts`, `README.md`, `knowledge-base/features.md`, `knowledge-base/mistakes-and-learnings.md`

- Reel clipboard state is now scoped per signed-in user instead of persisting across the whole app session.
- Switching accounts no longer leaves a dismissed reel URL stuck in memory and hidden for the next account.
- Reel banner/modal mounting now follows authenticated-session state rather than requiring `primary_service`, matching the intended behavior for all logged-in users.

## 2026-04-25 — Wait for auth hydration before reel parsing

**Files changed**: `app/_layout.tsx`, `hooks/useClipboardReel.ts`, `hooks/useNotifications.ts`, `components/ReelImportModal.tsx`, `README.md`, `knowledge-base/features.md`, `knowledge-base/mistakes-and-learnings.md`

- Reel clipboard polling now starts only after auth/profile hydration is complete.
- `ReelImportModal` now waits for a fully available session/user before invoking `parse-reel` and passes the current bearer token explicitly to the edge function.
- Push-token registration is also gated on hydrated auth state to avoid firing Supabase requests during account-switch races.

## 2026-04-25 — Stop YouTube Music from opening wrong same-artist tracks

**Files changed**: `lib/youtubeMusic.ts`, `README.md`, `knowledge-base/integrations/youtube-music.md`, `knowledge-base/mistakes-and-learnings.md`

- YTM title normalization now preserves Unicode letters/numbers instead of collapsing non-Latin titles to empty strings.
- Topic candidates with zero title match are now rejected even if the artist channel matches strongly.
- This makes YTM fail safely and fall back instead of opening the wrong song for same-artist searches.

## 2026-04-25 — Reel YTM open now falls back on safe-match failure

**Files changed**: `components/ReelImportModal.tsx`, `knowledge-base/features.md`

- When YTM cannot verify a safe Topic-song match for a reel result, the reel opener now returns `false` and falls back to the existing web search path instead of surfacing a hard error or opening a guessed same-artist song.

## 2026-04-26 — Fix avatar picker preview and redesign library filters

**Files changed**: `lib/avatarUpload.ts`, `app/(tabs)/profile.tsx`, `app/(tabs)/library.tsx`, `README.md`, `knowledge-base/features.md`, `knowledge-base/mistakes-and-learnings.md`, `knowledge-base/log.md`

- Swapped the avatar picker off deprecated `ImagePicker.MediaTypeOptions` to the current media-types API.
- Avatar uploads now use an `ArrayBuffer`, stable storage path, cache-busting URL, and immediate local preview after image selection.
- Replaced the old library chip row with clearer content filters for playlists, songs, reel lists, and artists, and wired the empty state to the active filter.

## 2026-04-26 — Remove manual top spacer from library screen

**Files changed**: `app/(tabs)/library.tsx`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Replaced the library screen's hard-coded top spacer with `SafeAreaView`.
- This removes the oversized blank area above the playlist list and keeps the header aligned to the real device inset.

## 2026-04-26 — Constrain library filter ScrollView height

**Files changed**: `app/(tabs)/library.tsx`, `README.md`, `knowledge-base/mistakes-and-learnings.md`

- Added an explicit height/flex constraint to the horizontal filter `ScrollView`.
- This prevents the filter rail from expanding vertically and pushing the playlist list down the page.

## 2026-04-26 — Loosen library filter height cap slightly

**Files changed**: `app/(tabs)/library.tsx`, `README.md`

- Increased the filter rail height cap a bit so chip text no longer clips at the bottom while keeping the row from expanding vertically.

## 2026-04-25 — Use canonical Apple Music playlist URLs after conversion

**Files changed**: `components/PlaylistModal.tsx`, `lib/appleMusic.ts`, `supabase/functions/convert-playlist/index.ts`, `README.md`, `knowledge-base/features.md`, `knowledge-base/integrations/apple-music.md`, `knowledge-base/log.md`, `knowledge-base/mistakes-and-learnings.md`

- Fixed Apple Music playlist handoff after successful conversion by propagating the canonical `attributes.url` returned by Apple Music instead of constructing a guessed `library/playlist/{id}` URL from the raw library playlist ID.
- `convert-playlist` now returns `playlistUrl` for Apple Music when available, and the success modal uses that URL for `Open in Apple Music`.
- Added a follow-up Apple Music library-playlist lookup because the create-playlist response may omit `attributes.url`; the modal now logs the exact playlist URL handoff payload for debugging.
- Added a catalog-relationship lookup for Apple Music library playlists. If Apple still does not expose a direct playlist URL, the app now falls back to opening the Apple Music Library instead of the broken `item not available` path.
- Updated the success modal copy/button for the Apple Music fallback case so users see `Open Apple Music Library` and a note that the new playlist may take a moment to appear.

## 2026-04-25 — Show “Already In Library” for converted shared playlists

**Files changed**: `components/PlaylistModal.tsx`, `hooks/useSharedItems.ts`, `types/index.ts`, `README.md`, `IDEAS.md`, `knowledge-base/features.md`, `knowledge-base/log.md`

- Shared playlist rows now expose `conversion_status` and `tracks_processed` in app types, and the inbox refresh hook now subscribes to `UPDATE` as well as `INSERT`.
- Reopening a playlist that was already converted for the recipient now shows `Already In Library` instead of another `Add to [service]` button.
- Fresh in-session conversions still show the success state first; the stable reopened state is now the explicit already-added UI.

## 2026-04-25 — Fix PlaylistModal hook order regression

**Files changed**: `components/PlaylistModal.tsx`, `knowledge-base/log.md`

- Fixed a React Rules of Hooks violation in `PlaylistModal` caused by declaring a `useEffect` after an early `if (!item) return null`.
- The modal now keeps hook order stable by computing null-safe derived values before the final early return.

## 2026-04-25 — Keep PlaylistModal progress state from regressing to idle

**Files changed**: `components/PlaylistModal.tsx`, `README.md`, `knowledge-base/features.md`, `knowledge-base/log.md`

- Fixed a state-sync bug where `PlaylistModal` could reset from `waiting` / `processing` / `done` back to the idle add button while a conversion was still running.
- The modal now distinguishes between a fresh conversion started in the current session and a playlist that was already converted earlier, so in-flight progress/success UI is preserved and `Already In Library` only appears on reopen.

## 2026-04-25 — Harden Apple Music token flow and supporting client/runtime edges

**Files changed**: `SETUP.md`, `README.md`, `app/(tabs)/library.tsx`, `components/ReelImportModal.tsx`, `knowledge-base/architecture.md`, `knowledge-base/auth.md`, `knowledge-base/integrations/apple-music.md`, `knowledge-base/log.md`, `lib/appleMusic.ts`, `lib/reelLists.ts`, `lib/spotify.ts`, `modules/apple-music/index.ts`, `modules/apple-music/ios/AppleMusicModule.swift`, `supabase/functions/apple-music-auth/index.ts`, `supabase/functions/convert-playlist/index.ts`, `types/index.ts`

- Removed the stale browser-based Apple Music auth page from `apple-music-auth`; the function is now an authenticated POST-only token signer again, so current setup docs no longer tell users to deploy it with `--no-verify-jwt`.
- `convert-playlist` now resolves Apple Music track matches against the recipient storefront from `/v1/me/storefront` instead of hardcoding `us`.
- Apple Music recent-played rows now use the API’s playback timestamp when available instead of recording request time.
- Reel list AsyncStorage writes are now serialized per user to avoid read-modify-write races, and library reel-list loading now handles read errors explicitly.
- Spotify refresh failure no longer clears the reconnect-required flag by accident when invalid tokens are purged.
- Native Apple Music JS/Swift bridges now fail more defensively for authorization/storefront errors instead of returning ambiguous values.

## 2026-04-25 — Scope app TypeScript away from Deno edge functions

**Files changed**: `tsconfig.json`, `package.json`, `README.md`, `knowledge-base/log.md`

- The root app `tsconfig.json` now explicitly includes React Native app sources and excludes `supabase/functions`, so app typechecking no longer gets polluted by Deno-specific edge-function imports.
- Added `npm run typecheck` as the clean app TypeScript check to use during normal development.

## 2026-04-26 — Complete IDEAS.md NOTES cleanup pass

**Files changed**: `IDEAS.md`, `README.md`, `app/(tabs)/_layout.tsx`, `app/(tabs)/friends.tsx`, `app/(tabs)/home.tsx`, `app/(tabs)/library.tsx`, `app/(tabs)/notifications.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/settings.tsx`, `components/LibraryPlaylistDetailModal.tsx`, `components/ShareModal.tsx`, `hooks/useFollows.ts`, `knowledge-base/features.md`, `knowledge-base/log.md`, `knowledge-base/mistakes-and-learnings.md`, `knowledge-base/roadmap.md`

- Completed the app-side NOTES cleanup from `IDEAS.md`: favorite-song search now covers Apple Music and cleaned YouTube Music results; People search and share search auto-populate; taste-match percentages are data-based; suggested follows exclude already-followed users; and home/library/profile top bars now route into search/notification/share entry points.
- Added a hidden `notifications` tab route that shows recent shares and new followers in one in-app inbox.
- Fixed the remaining TypeScript issues in the related share flows by replacing unsupported Supabase `abortSignal` chaining with the existing `withTimeout()` helper.

## 2026-04-26 — Complete IDEAS.md FIXES pass

**Files changed**: `IDEAS.md`, `README.md`, `app/(tabs)/_layout.tsx`, `app/(tabs)/home.tsx`, `app/(tabs)/library.tsx`, `app/(tabs)/share.tsx`, `components/ReelImportModal.tsx`, `components/ShareModal.tsx`, `hooks/useLibrary.ts`, `lib/appleMusic.ts`, `lib/spotify.ts`, `lib/youtubeMusic.ts`, `knowledge-base/features.md`, `knowledge-base/log.md`, `knowledge-base/mistakes-and-learnings.md`, `knowledge-base/roadmap.md`

- Library search now indexes a bounded slice of playlist tracks so songs inside playlists can be found without fetching entire large playlists in the background.
- Library filters now include real songs and reel-sourced songs, reel lists remain browsable, and sort controls apply to playlists, songs, reel lists, and artists.
- Home feed rows now say `opens in your ...` based on the recipient's primary service instead of the sender's service.
- The center-tab share menu now fades in and routes `Identify a reel` to a paste screen; reel best-match previews are tappable.
- Removed the completed `FIXES` section from `IDEAS.md`.

## 2026-04-26 — Refine library song and reel presentation

**Files changed**: `app/(tabs)/library.tsx`, `README.md`, `knowledge-base/features.md`, `knowledge-base/log.md`

- Moved reel-imported songs into their own `Reel Songs` section, visible under the Reels filter instead of mixed into normal Songs.
- Changed the normal Songs section to stay collapsed outside the Songs filter, with an expandable preview and a path to the full Songs filter.
- Library search now deduplicates matching songs across multiple playlists and suppresses playlist results when the query matches a song title in the library.

## 2026-04-26 — Stabilize library refresh and All Songs row

**Files changed**: `app/(tabs)/library.tsx`, `components/LibraryPlaylistDetailModal.tsx`, `hooks/useLibrary.ts`, `README.md`, `knowledge-base/features.md`, `knowledge-base/log.md`

- Stabilized library fetch/preload dependencies so tab focus and playlist-track indexing do not repeatedly restart library loading.
- Batched playlist-track preload updates instead of setting library index state after every playlist.
- Replaced the collapsed songs preview with an `All Songs` pseudo-playlist row that opens the playlist detail modal with deduped song tracks.
- Made reel-imported song rows tappable from the Reels filter while keeping them separate from normal library songs.
- No database changes were made; this remains a UI/local-state refinement.

## 2026-04-26 — Persist reel import history in Supabase

**Files changed**: `supabase/migrations/006_reel_import_history.sql`, `lib/reelLists.ts`, `README.md`, `knowledge-base/database.md`, `knowledge-base/features.md`, `knowledge-base/log.md`

- Added `reel_imports` and `reel_import_songs` tables with owner-only RLS so saved reel song lists are durable across sessions/devices.
- Rewired `lib/reelLists.ts` to read/save/delete Supabase reel history first and fall back to AsyncStorage only when the migration has not been applied yet.
- Existing local reel lists remain readable as fallback, but new durable history requires applying migration `006_reel_import_history.sql`.

## 2026-04-27 — Make library filters functional when empty

**Files changed**: `app/(tabs)/library.tsx`, `README.md`, `knowledge-base/features.md`, `knowledge-base/log.md`, `knowledge-base/preferences.md`

- Added the design law that no visible UI element should be completely nonfunctional; empty controls must open a placeholder or explicit empty state.
- Library filter chips are always clickable, even when their count is zero.
- Empty filtered library views now show `No Results.` instead of disabling the filter or hiding the route.
- `All Songs` remains a playlist-style row even when no indexed songs are present.
- `Reel Songs` now appears as a playlist-style row; single-song reel saves appear as song rows inside it, while multi-song reel saves appear as sub-list rows inside it.

## 2026-04-27 — Expand reels directly in Reels filter

**Files changed**: `app/(tabs)/library.tsx`, `knowledge-base/log.md`

- In the main Library view, Reels still appears as a single playlist-style `Reel Songs` row.
- When the Reels filter is active, the Library page expands directly into saved reel song rows and multi-song reel sub-list rows without requiring an extra click into `Reel Songs`.

## 2026-04-29 — Wire inert UI controls and track placeholders

**Files changed**: `IDEAS.md`, `README.md`, `app/(tabs)/home.tsx`, `app/(tabs)/library.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/settings.tsx`, `components/PlaylistModal.tsx`, `components/StoryViewer.tsx`, `components/UserProfileModal.tsx`, `knowledge-base/features.md`, `knowledge-base/log.md`, `knowledge-base/mistakes-and-learnings.md`, `knowledge-base/roadmap.md`

- Added real behavior for story caption entry, profile quick-connect, profile sharing, settings photo changes, password reset, playlist run-in-background, and library artist taps.
- Added explicit placeholder alerts for deferred story replies/options, profile notifications/options, Friend Blend, artist pages, block list, legal docs, and app rating.
- Added a new `Placeholder UI Follow-ups` section to `IDEAS.md` so placeholder-only behavior can be replaced later.

## 2026-04-29 — Fix UI data-flow and persistence review findings

**Files changed**: `README.md`, `app/(tabs)/friends.tsx`, `app/(tabs)/home.tsx`, `app/(tabs)/library.tsx`, `app/(tabs)/notifications.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/settings.tsx`, `components/PlaylistModal.tsx`, `components/ReelImportModal.tsx`, `components/StoryViewer.tsx`, `components/UserProfileModal.tsx`, `components/ui.tsx`, `hooks/useReactions.ts`, `hooks/useStories.ts`, `knowledge-base/database.md`, `knowledge-base/features.md`, `knowledge-base/log.md`, `knowledge-base/mistakes-and-learnings.md`, `lib/reelLists.ts`, `supabase/migrations/007_reel_import_songs_rpc.sql`

- Removed truncating taste-match queries, fixed mutual badges and sender avatars, added error feedback for story search/open/reaction paths, and guarded empty story/profile data.
- Fixed Library playlist sharing from the row action, memoized heavy library/feed derived values, persisted Settings toggles locally, and hardened Profile searches/disconnect/public-share rendering.
- Added `upsert_reel_import_songs` so saved reel song replacement is atomic, plus local-migration cleanup and remote retry backoff in `lib/reelLists.ts`.
