# MusicBridge

**Author**: Zechariah Frierson | **Status**: MVP in Development | **Date**: March 2026

Cross-platform music sharing app. Users on Spotify, Apple Music, and YouTube Music can share songs and playlists — MusicBridge automatically recreates them on the recipient's streaming service.

Long-term vision: social music platform with feeds, following, collaborative playlists, and artist tools.

---

## Tech Stack

| | |
|---|---|
| Framework | Expo SDK 55, React Native 0.83.2, React 19.2.0 |
| Routing | Expo Router (file-based) |
| Backend | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Language | TypeScript |

> `npm install --legacy-peer-deps` required (react-dom peer dep conflict with Expo SDK 55 / React 19).

---

## Running Locally

```bash
cp .env.example .env.local   # fill in credentials (see SETUP.md)
npx expo start --dev-client  # Metro bundler for the custom iOS dev client
npx expo run:ios             # iOS native build
npx expo run:android         # Android native build
npm run typecheck            # app TypeScript check (excludes Deno edge functions)
supabase db push             # apply new Supabase migrations to linked dev project
```

See `SETUP.md` for full credential setup (Supabase, Spotify, Google, Apple Music).

---

## Repository Structure

```
musicbridge/
├── app/
│   ├── _layout.tsx             Root layout: AuthProvider + SafeAreaProvider + redirect logic
│   ├── index.tsx               Loading screen while auth resolves
│   ├── (auth)/
│   │   ├── login.tsx           Email/password login
│   │   └── register.tsx        2-step registration: credentials → primary service → optional immediate service connection
│   └── (tabs)/
│       ├── _layout.tsx         Tab bar (Ionicons)
│       ├── home.tsx            Feed of received shared items with working inbox/following/mixes filters, story posting/reactions, editable story captions, and top-bar search/notifications/share actions
│       ├── friends.tsx         People tab with auto-search, suggested follows, and data-based taste match scores
│       ├── library.tsx         User's streaming library with sort controls, All Songs/Reel Songs pseudo-playlists, clickable empty filters, deduped playlist-track-backed search, and placeholder artist-page actions
│       ├── notifications.tsx   Notification inbox for recent shares and new followers
│       ├── profile.tsx         Profile + avatar picker + service connections, quick connect/share profile, favorite-song search + sign out
│       ├── settings.tsx        Settings screen with keyboard-aware profile editing, avatar upload, password reset, toggles, and placeholder legal/rating rows
│       └── share.tsx           Center-tab reel paste screen for manual reel identification
├── components/
│   ├── SongCard.tsx
│   ├── PlaylistCard.tsx
│   ├── PlaylistModal.tsx       Playlist detail + conversion UI; preserves in-flight progress/success and shows "Already In Library" when reopened later
│   ├── ShareModal.tsx          Search + share-to-friend modal
│   ├── FriendListItem.tsx
│   ├── FriendPickerModal.tsx   Reusable friend picker with optional message; refreshes mutual follows on open
│   ├── LibraryPlaylistDetailModal.tsx   Playlist tracks + inline share picker; refreshes mutual follows on share
│   ├── ReelImportBanner.tsx    Slim banner shown when a reel URL is in the clipboard
│   ├── ReelImportModal.tsx     Full reel-import flow: analyze → song list → save/share/open; best-match previews are tappable and YTM opens fall back to web search if no safe song match exists
│   ├── StoryViewer.tsx         Story playback with reactions, open-in-service, and placeholder more/reply handling
│   ├── MusicServiceButton.tsx
│   ├── ServiceBadge.tsx
│   └── ui.tsx                  Shared app bar, avatar, chip, icon-button, and cover-art primitives
├── hooks/
│   ├── useAuth.tsx             AuthContext + hook
│   ├── useFollows.ts           Following/follower graph, search, and suggested users
│   ├── useSharedItems.ts       Inbox fetch + realtime insert/update refresh
│   ├── useLibrary.ts           Playlists, saved tracks, followed artists; bounded/lazy playlist-track loading
│   ├── useClipboardReel.ts     Clipboard polling for reel URLs after auth hydration; resets dismissed/pending reel state per signed-in user
│   └── useNotifications.ts     Push registration + tap handler
├── lib/
│   ├── supabase.ts
│   ├── spotify.ts
│   ├── appleMusic.ts           Native Apple Music auth + Apple Music API
│   ├── youtubeMusic.ts
│   ├── notifications.ts        Register/unregister tokens, sendPushNotification helper
│   ├── reelParser.ts           parseReelUrl, isReelUrl, platform/shortcode types
│   ├── theme.ts                Shared colors and radius tokens
│   └── utils.ts                withTimeout(), cleanArtistName(), cleanTitle()
├── modules/
│   └── apple-music/
│       ├── index.ts            JS bridge for the local Expo module
│       └── ios/                Native iOS MusicKit / StoreKit module
├── types/index.ts
├── supabase/
│   ├── functions/
│   │   ├── convert-playlist/index.ts    Edge Function: server-side conversion + progress
│   │   ├── send-notification/index.ts   Edge Function: Expo push delivery
│   │   └── parse-reel/index.ts          Edge Function: Instagram reel → song (metadata + AudD)
│   └── migrations/
│       ├── 001_initial.sql
│       ├── 003_conversion_progress.sql
│       ├── 004_follows_and_profile.sql
│       └── 005_push_tokens.sql
└── .env.example
```

---

## Architecture

No custom backend server. All logic runs on the client. Supabase handles auth, the database, and RLS. Streaming API calls go directly from the device using stored OAuth tokens.

- **On-device auth**: Spotify + Google via `expo-auth-session`; Apple Music via native iOS MusicKit / StoreKit in a local Expo module
- **Tokens in Supabase**: stored in `public.users`, RLS-protected (owner-only)
- **Playlist conversion**: runs in `supabase/functions/convert-playlist/` (Edge Function). Progress updates via Supabase Realtime. Client shows live progress bar.

---

## Authentication

### MusicBridge (Supabase)

Email + password via `supabase.auth.signInWithPassword`. Sessions persisted in AsyncStorage. An `on_auth_user_created` trigger creates the `public.users` profile row on signup.

Signup is a 2-step flow: credentials first, then primary-service selection. After the user picks a primary service, the app immediately offers to connect that service before routing to Home.
If a Spotify refresh token has gone bad, the app shows a reconnect prompt on the next login and can route the user straight to Profile to reconnect.
Reel import, clipboard polling, and push-token registration all wait for hydrated auth/session state before making Supabase-backed requests so account switching does not race session transport.

### Streaming Service OAuth

| Service | Flow | Redirect URI |
|---|---|---|
| Spotify | PKCE via `expo-auth-session` | `musicbridge://spotify-callback` |
| YouTube Music | PKCE via Google OAuth | reverse-DNS from Client ID |
| Apple Music | Native iOS MusicKit / StoreKit auth + server-signed developer token | none |

Spotify + YouTube tokens auto-refresh when within 60s of expiry. Apple Music tokens have no expiry. If Spotify refresh fails, the app now clears the invalid stored Spotify tokens and treats Spotify as disconnected until the user reconnects.

**Spotify scopes**: `user-read-private`, `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`, `user-library-read`, `user-follow-read`

---

## Streaming Service Integrations

### Spotify (`lib/spotify.ts`)

| Function | Purpose |
|---|---|
| `connectSpotify` | PKCE OAuth |
| `getSpotifyAccessToken` | Auto-refresh; clears invalid Spotify tokens on refresh failure and triggers a reconnect prompt on next login |
| `searchTrack` | Single-track match for conversion (retries 3× on 429; aborts if Retry-After > 15s) |
| `searchTracks` | Free-form search (10 results) |
| `createPlaylist` | Create + batch-add tracks |
| `getUserPlaylists` | All pages (50/page) |
| `getPlaylistTracks` | Playlist tracks with optional max-track cap for bounded library search preloads; all pages when uncapped |
| `getSavedTracks` | All pages (50/page) |
| `getFollowedArtists` | Followed artists |

Deep links: `spotify:track:<id>` / `spotify:playlist:<id>`

---

### Apple Music (`lib/appleMusic.ts`)

Requires Apple Developer membership with MusicKit enabled for the app's bundle ID. iOS authorization is handled natively through the local Expo module in `modules/apple-music`, which requests Apple Music permission and exchanges a server-signed developer token for a Music user token. The app then uses storefront-aware catalog lookups so Apple Music links resolve in the recipient's region when possible.

| Function | Purpose |
|---|---|
| `connectAppleMusic` | Native iOS Apple Music authorization + user token exchange |
| `searchTrack` | Single-track match for conversion |
| `searchTracks` | Free-form catalog search |
| `createPlaylist` | Create a playlist in the user's Apple Music library and return Apple Music's canonical playlist URL when available |
| `getUserPlaylists` | User library playlists |
| `getPlaylistTracks` | Tracks in a library playlist with optional max-track cap for bounded library search preloads |
| `getSavedSongs` | User library songs |
| `resolveAppleMusicTrackLinks` | Resolve a storefront-local song URL before opening Apple Music |

Deep links: canonical Apple Music song URL with `music://` fallback. Shared-playlist conversion tries Apple Music's catalog playlist URL when available; if Apple doesn't expose a direct playlist URL for the created library playlist, the app falls back to opening the user's Apple Music Library instead of a broken `library/playlist/{id}` path, and the success modal explains that the playlist may take a moment to appear.

---

### YouTube Music (`lib/youtubeMusic.ts`)

| Function | Purpose |
|---|---|
| `connectYouTubeMusic` | PKCE via Google OAuth |
| `getYouTubeAccessToken` | Auto-refresh |
| `searchTrack` | Topic-channel song match only; preserves non-Latin title matching and rejects zero-title-match guesses |
| `searchTracks` | Free-form (25 results) |
| `createPlaylist` | Create playlist, then add each video individually (no batch API) |
| `getUserPlaylists` | `mine=true`, batch-check first video per playlist for Music category |
| `getPlaylistTracks` | Paginated, Music category only, with optional max-track cap for bounded library search preloads |
| `getLikedMusic` | Playlist ID `LM` (YouTube Music Liked Music, not `LL` Liked Videos) |

All library data is filtered to `videoCategoryId=10`. Artist names are extracted via a multi-stage pipeline: parse from video title (`"Artist - Song"` format) → recover from video description (IIP-DDS pipe format, `아티스트:` fields, `Performed by`) → fall back to tags → cleaned channel title. This correctly handles distributor/aggregator channels (e.g. "release", IIP-DDS) that upload OST content without being the performing artist.

Deep links: `youtubemusic://watch?v=<id>&vType=audio`

---

## Database Schema

### `public.users`

| Column | Type |
|---|---|
| `id` | uuid (FK → auth.users) |
| `username` | text (unique) |
| `display_name` | text |
| `primary_service` | enum: spotify / apple_music / youtube_music |
| `spotify_access_token`, `_refresh_token`, `_token_expiry` | text / timestamptz |
| `apple_music_user_token` | text |
| `youtube_access_token`, `_refresh_token`, `_token_expiry` | text / timestamptz |

RLS: users can read all rows (friend search), update only their own.

### `public.push_tokens`

| Column | Type |
|---|---|
| `id` | uuid |
| `user_id` | uuid FK → users |
| `token` | text (Expo push token) |
| `platform` | text: `ios` / `android` |
| `created_at` | timestamptz |

Unique constraint on `(user_id, token)`. RLS: owner-only. Upserted on login, deleted on sign-out.

### `public.follows`

| Column | Type |
|---|---|
| `id` | uuid |
| `follower_id`, `following_id` | uuid FK → users |
| `created_at` | timestamptz |

Unique constraint on `(follower_id, following_id)` and check `(follower_id <> following_id)`.

### `public.shared_items`

| Column | Type |
|---|---|
| `id` | uuid |
| `sender_id`, `recipient_id` | uuid FK → users |
| `type` | enum: song / playlist |
| `title`, `artist`, `cover_image_url` | text |
| `spotify_id`, `apple_music_id`, `youtube_music_id` | text (nullable) |
| `spotify_playlist_id`, `apple_music_playlist_id`, `youtube_music_playlist_id` | text (nullable) |
| `tracks` | jsonb — `[{title, artist, spotify_id, apple_music_id, youtube_music_id}]` |
| `message` | text |
| `opened` | boolean |
| `conversion_status` | text (added in migration 003) |
| `tracks_processed` | int (added in migration 003) |

### `public.reel_imports`

| Column | Type |
|---|---|
| `id` | uuid |
| `user_id` | uuid FK → users |
| `title` | text |
| `reel_url` | text |
| `created_at` | timestamptz |

Unique constraint on `(user_id, reel_url)`. RLS: owner-only. Stores saved reel song-list history.

### `public.reel_import_songs`

| Column | Type |
|---|---|
| `id` | uuid |
| `reel_import_id` | uuid FK → reel_imports |
| `position` | int |
| `title`, `artist`, `cover_url` | text |
| `created_at` | timestamptz |

RLS: owner-only through the parent `reel_imports` row.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |

Apple Music developer tokens are generated server-side by `supabase/functions/apple-music-auth/`.
Set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` as Supabase secrets; do not expose the `.p8` key or developer JWT in Expo public env. The current native Apple Music flow calls `apple-music-auth` as an authenticated Supabase Edge Function, so there is no public `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL` browser auth page in use.

---

## Instagram Reel Import

Users can paste an Instagram/TikTok reel URL from the center-tab share action, share an Instagram reel URL to MusicBridge, or copy it to the clipboard. The app detects clipboard/shared URLs on foreground and shows a slim banner for any authenticated user.

**Flow**:
1. `useClipboardReel` polls the clipboard once auth/profile hydration finishes and every time the app returns to the foreground after that. Dismissed/pending reel state is scoped to the current signed-in user so switching accounts does not suppress the same reel on another profile.
2. `ReelImportBanner` appears at the top of every screen with a "Find Song" button.
3. Tapping "Find Song" or submitting the center-tab reel paste screen opens `ReelImportModal`, which calls the `parse-reel` Edge Function.
4. On success: shows an ordered song list that can be opened in the user's primary service, saved as a reel list in Library, or shared with a friend. The live "Best match so far" card is also tappable.
5. On failure: shows a brief error state and auto-closes after 2 seconds.

Saved reel lists are persisted in Supabase via `reel_imports` + `reel_import_songs` (migration `006_reel_import_history.sql`). The app falls back to local storage only if those tables are unavailable.

**Reel analysis pipeline**:

| Stage | Method | Notes |
|---|---|---|
| 1 | Instagram metadata scrape | Hits Instagram GraphQL with a mobile-style header set. Parses `clips_music_attribution_info`, caption text, preview comments, plus `video_url` / `video_duration` for follow-up analysis. Caption parsing is intentionally strict to avoid false positives from natural-language captions. |
| 2 | AudD audio fingerprinting | Uploads the reel file once to `https://enterprise.audd.io/` for a full enterprise scan, aggregates repeated chunk hits, canonicalizes titles/artists through iTunes, and returns `matchCount` + `orderHint` so the client can rank results. Requires `AUDD_API_TOKEN` Supabase secret. |
| 3 | Client frame OCR | `ReelImportModal` extracts a small early sample plus a larger late sample with `expo-video-thumbnails`, sends those frames back to the edge function, and Claude Haiku is instructed to return songs only when both song title and artist are directly readable on-screen. Album-cover inference is explicitly disallowed. |
| 4 | Client confidence merge | The modal ranks raw `audioSongs`, `metadataSong`, `textSongs`, and OCR hits together. Audio-only intros/interludes are penalized, repeated OCR hits get boosted, and final ordering prefers the earliest observed reel position. OCR hits are canonicalized through iTunes with a small typo-tolerant fallback so minor frame-reading mistakes can still resolve to the real track. |
| 5 | Staged vision fallback | Vision OCR runs whenever the initial metadata/audio/text result is still thin. Most reels use a staged late → middle → early fallback. Short dense reels instead use a single full-timeline dense OCR sweep, which is better for 1-2 second song cards where every part of the reel changes quickly. OCR batches are kept small so Claude is less likely to collapse adjacent cards together. |

If all stages miss, the modal shows "Couldn't identify the song" and closes.

**TikTok**: URL patterns are already defined in `lib/reelParser.ts` (`REEL_PATTERNS.tiktok`). The `parse-reel` Edge Function only handles Instagram today; extending it for TikTok requires adding scraping/fingerprint routing for TikTok video URLs.

---

## Current Limitations

1. **Spotify developer-mode rate limits** — daily quota is low. The Edge Function backs off up to 15s on 429s then throws `spotify_rate_limit_exceeded`. Resolved by requesting a Spotify quota extension.

2. **Track matching is approximate** — uses `cleanTitle()` + `cleanArtistName()` + service-specific heuristics. No ISRC matching or duration filtering yet.

3. **Apple Music requires Apple Developer setup** — MusicKit must be enabled for the app's bundle ID, the provisioning profile must include that capability, and `apple-music-auth` must be deployed with Apple secrets before Apple Music login/conversion works.

4. **YouTube playlist creation is sequential** — no batch API for `playlistItems`; each track is a separate request.

5. **Track IDs not pre-resolved cross-service** — only the sender's service ID is stored at share time. Each recipient's Edge Function independently re-searches.

6. **Followed artists — Spotify only** — YouTube Music and Apple Music have no equivalent API endpoint.
