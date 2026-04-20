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
npx expo start               # Metro bundler
npx expo run:ios             # iOS native build
npx expo run:android         # Android native build
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
│   │   └── register.tsx        2-step registration: credentials → primary service
│   └── (tabs)/
│       ├── _layout.tsx         Tab bar (Ionicons)
│       ├── home.tsx            Feed of received shared items
│       ├── friends.tsx         People tab (following/followers), user search
│       ├── library.tsx         User's streaming library
│       └── profile.tsx         Profile + service connections + sign out
├── components/
│   ├── SongCard.tsx
│   ├── PlaylistCard.tsx
│   ├── PlaylistModal.tsx       Playlist detail + "Add to [service]" conversion UI
│   ├── ShareModal.tsx          Search + share-to-friend modal
│   ├── FriendListItem.tsx
│   ├── FriendPickerModal.tsx   Reusable friend picker with optional message
│   ├── LibraryPlaylistDetailModal.tsx
│   ├── ReelImportBanner.tsx    Slim banner shown when a reel URL is in the clipboard
│   ├── ReelImportModal.tsx     Full reel-import flow: analyze → song card → share
│   ├── MusicServiceButton.tsx
│   └── ServiceBadge.tsx
├── hooks/
│   ├── useAuth.tsx             AuthContext + hook
│   ├── useFollows.ts
│   ├── useSharedItems.ts
│   ├── useLibrary.ts           Playlists, saved tracks, followed artists; lazy track loading
│   ├── useClipboardReel.ts     Clipboard polling for reel URLs; fires on mount + foreground
│   └── useNotifications.ts     Push registration + tap handler
├── lib/
│   ├── supabase.ts
│   ├── spotify.ts
│   ├── appleMusic.ts           DEFERRED — see limitations
│   ├── youtubeMusic.ts
│   ├── notifications.ts        Register/unregister tokens, sendPushNotification helper
│   ├── reelParser.ts           parseReelUrl, isReelUrl, platform/shortcode types
│   └── utils.ts                withTimeout(), cleanArtistName(), cleanTitle()
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

- **PKCE OAuth on-device**: Spotify + Google via `expo-auth-session`; Apple Music via `expo-web-browser` + hosted MusicKit JS page
- **Tokens in Supabase**: stored in `public.users`, RLS-protected (owner-only)
- **Playlist conversion**: runs in `supabase/functions/convert-playlist/` (Edge Function). Progress updates via Supabase Realtime. Client shows live progress bar.

---

## Authentication

### MusicBridge (Supabase)

Email + password via `supabase.auth.signInWithPassword`. Sessions persisted in AsyncStorage. An `on_auth_user_created` trigger creates the `public.users` profile row on signup.

### Streaming Service OAuth

| Service | Flow | Redirect URI |
|---|---|---|
| Spotify | PKCE via `expo-auth-session` | `musicbridge://spotify-callback` |
| YouTube Music | PKCE via Google OAuth | reverse-DNS from Client ID |
| Apple Music | MusicKit JS page in `expo-web-browser` | `musicbridge://apple-music-callback` |

Spotify + YouTube tokens auto-refresh when within 60s of expiry. Apple Music tokens have no expiry.

**Spotify scopes**: `user-read-private`, `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`, `user-library-read`, `user-follow-read`

---

## Streaming Service Integrations

### Spotify (`lib/spotify.ts`)

| Function | Purpose |
|---|---|
| `connectSpotify` | PKCE OAuth |
| `getSpotifyAccessToken` | Auto-refresh |
| `searchTrack` | Single-track match for conversion (retries 3× on 429; aborts if Retry-After > 15s) |
| `searchTracks` | Free-form search (10 results) |
| `createPlaylist` | Create + batch-add tracks |
| `getUserPlaylists` | All pages (50/page) |
| `getPlaylistTracks` | All pages (100/page) |
| `getSavedTracks` | All pages (50/page) |
| `getFollowedArtists` | Followed artists |

Deep links: `spotify:track:<id>` / `spotify:playlist:<id>`

---

### Apple Music (`lib/appleMusic.ts`) — DEFERRED

Requires $99/year Apple Developer membership. Code is retained but non-functional. The Edge Function returns HTTP 400 for Apple Music recipients. Will revisit when the app gains traction.

---

### YouTube Music (`lib/youtubeMusic.ts`)

| Function | Purpose |
|---|---|
| `connectYouTubeMusic` | PKCE via Google OAuth |
| `getYouTubeAccessToken` | Auto-refresh |
| `searchTrack` | Music topic filtered (`topicId=/m/04rlf`, `videoCategoryId=10`) |
| `searchTracks` | Free-form (25 results) |
| `createPlaylist` | Create playlist, then add each video individually (no batch API) |
| `getUserPlaylists` | `mine=true`, batch-check first video per playlist for Music category |
| `getPlaylistTracks` | Paginated, Music category only |
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

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` | Spotify app client ID |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `EXPO_PUBLIC_APPLE_TEAM_ID` | Apple Developer team ID |
| `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL` | Hosted MusicKit JS page URL |
| `EXPO_PUBLIC_APPLE_DEVELOPER_TOKEN` | Apple Music developer JWT |

---

## Instagram Reel Import

Users can share an Instagram reel URL to MusicBridge (or simply copy it to the clipboard). The app detects the URL on foreground and shows a slim banner.

**Flow**:
1. `useClipboardReel` polls the clipboard on mount and every time the app returns to the foreground.
2. `ReelImportBanner` appears at the top of every screen with a "Find Song" button.
3. Tapping "Find Song" opens `ReelImportModal`, which calls the `parse-reel` Edge Function.
4. On success: shows the identified song card (title, artist, cover art) with an inline friend picker and optional message field.
5. On failure: shows a brief error state and auto-closes after 2 seconds.

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

3. **Apple Music deferred** — entire integration blocked on $99/year Apple Developer membership.

4. **YouTube playlist creation is sequential** — no batch API for `playlistItems`; each track is a separate request.

5. **Track IDs not pre-resolved cross-service** — only the sender's service ID is stored at share time. Each recipient's Edge Function independently re-searches.

6. **Followed artists — Spotify only** — YouTube Music and Apple Music have no equivalent API endpoint.
