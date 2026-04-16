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
