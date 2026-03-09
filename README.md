# MusicBridge: Cross-Platform Playlist Sharing and Music Discovery

Author: Zechariah Frierson
Date: March 2026
Status: MVP in Development

---

# 1. Overview

MusicBridge is a cross-platform music sharing application that enables users on different music streaming services to seamlessly share playlists and songs with one another.

Music streaming platforms currently operate in isolated ecosystems. Users frequently encounter friction when attempting to share playlists with friends who use different services (e.g., Spotify vs Apple Music vs YouTube Music). In these situations, recipients must manually recreate playlists by searching for each song individually.

MusicBridge removes this friction by acting as a translation layer between music platforms. Users can share playlists with other MusicBridge users, and the application automatically recreates the playlist on the recipient's streaming service.

Beyond simple playlist conversion, MusicBridge aims to evolve into a social music platform where users can share playlists, discover music, follow other users, and promote music and artists.

---

# 2. Motivation

Music discovery is inherently social. People discover music through friends, communities, and shared cultural experiences.

However, modern music streaming platforms divide users across different services, which creates barriers to sharing.

Examples of common problems:

- A Spotify user cannot easily use a playlist created on Apple Music.
- A YouTube Music user cannot send a playlist to a Spotify user without manual effort.
- Recreating playlists manually is tedious and error-prone.

MusicBridge solves this problem by allowing playlists to be automatically translated between services.

The long-term vision is to create a platform that improves music discovery while remaining independent of any single streaming service.

---

# 3. Product Goals

MusicBridge aims to achieve several core goals.

## 3.1 Primary Goals

1. Enable users to connect their streaming service accounts.
2. Allow users to view playlists from their home streaming service within MusicBridge.
3. Allow users to share playlists with other MusicBridge users.
4. Automatically convert playlists across different streaming platforms.

## 3.2 Secondary Goals

1. Enable social discovery of music and playlists.
2. Allow users to follow other users.
3. Create a feed for music and playlist sharing.
4. Provide tools for artists to promote music.

## 3.3 Long-Term Vision

MusicBridge may evolve into a music discovery ecosystem that includes:

- playlist sharing
- social feeds
- music promotion
- artist discovery
- recommendation systems

---

# 4. Target Users

MusicBridge primarily targets:

### Casual Music Listeners
Users who want an easier way to share music with friends using different platforms.

### Music Enthusiasts
Users who curate playlists and want to distribute them widely.

### Artists and Creators
Musicians or curators who want to promote playlists or songs across platforms.

---

# 5. Supported Streaming Platforms

MusicBridge integrates with external music streaming services through their APIs.

Planned or supported integrations include:

- Spotify
- Apple Music
- YouTube Music

These services act as the primary sources of music content.

MusicBridge does **not host or stream music itself**. Playback always occurs on the user's connected streaming service.

---

# 6. Core Features

## 6.1 MusicBridge Accounts

Users must create a MusicBridge account to use the platform.

Accounts allow users to:

- connect streaming services
- follow other users
- share playlists
- receive shared playlists
- interact socially

---

## 6.2 Streaming Service Integration

Users connect a streaming platform to their MusicBridge account.

One streaming service acts as the user's **home service**.

The home service is used to:

- retrieve playlists
- retrieve track metadata
- create new playlists when content is shared with the user.

---

## 6.3 Playlist Library Access

MusicBridge retrieves playlist data from the user's connected streaming account.

This includes metadata such as:

- playlist title
- playlist description
- track list
- artist metadata
- album metadata

MusicBridge does not permanently store the entire library but may cache metadata for performance.

---

## 6.4 Playlist Sharing

Users can share playlists with other MusicBridge users.

The sharing process includes:

1. User selects a playlist from their home service.
2. User selects a recipient.
3. Playlist metadata is transmitted through the MusicBridge platform.
4. Recipient receives the playlist within the app.

---

## 6.5 Playlist Conversion

If the sender and recipient use different streaming services, the playlist must be converted.

Conversion involves:

1. Extracting track metadata from the source playlist.
2. Searching the destination streaming service for matching tracks.
3. Selecting the best match for each track.
4. Creating a new playlist on the recipient's streaming account.
5. Adding matched tracks to the playlist.

The recipient can then listen to the playlist normally within their own streaming service.

---

# 7. Track Matching Algorithm

A critical component of MusicBridge is mapping songs between streaming platforms.

Different platforms may store songs with slightly different metadata.

The system therefore attempts to identify the closest equivalent track.

## 7.1 Basic Matching

Initial matching may rely on:

- track title
- artist name

Search queries are constructed using this information.

---

## 7.2 Improved Matching

More advanced matching may consider:

- normalized track titles
- normalized artist names
- album name similarity
- track duration similarity

---

## 7.3 Advanced Matching (Future)

More advanced matching methods may include:

- ISRC identifiers
- fuzzy string matching
- metadata weighting
- track popularity comparisons

These improvements increase conversion accuracy across platforms.

---

# 8. Social Features

MusicBridge aims to incorporate social functionality to improve music discovery.

---

## 8.1 Following

Users can follow other users.

Following allows users to see activity from people whose music tastes they trust.

---

## 8.2 Music Feed

MusicBridge includes a feed where users can share content.

Posts may include:

- playlists
- individual songs
- recommendations

The feed may consist of two primary views.

### Following Feed

Displays posts from users the user follows.

This feed is chronological.

### Discovery Feed

Displays content recommended by the platform.

Ranking may consider:

- engagement
- likes
- comments
- follower relationships

---

## 8.3 Engagement

Users may interact with posts by:

- liking
- commenting
- sharing

These interactions help determine discovery rankings.

---

## 8.4 Messaging

MusicBridge supports direct messaging between users.

Messages may contain:

- playlists
- songs
- recommendations

Messaging enables one-to-one music sharing.

---

## 8.5 Song of the Day

Users may share a daily featured song.

This feature allows lightweight music sharing similar to social media status updates.

---

# 9. Public Discovery

MusicBridge may allow public access to playlist pages.

Public pages allow users to view playlists without requiring an account.

Public discovery supports:

- viral sharing
- search engine discovery
- music promotion

---

# 10. Artist and Creator Tools

Future versions of MusicBridge may support verified creator accounts.

Features may include:

- verified artist profiles
- playlist promotion
- audience analytics
- follower insights

These tools help musicians reach listeners across multiple streaming platforms.

---

# 11. Security and Privacy

MusicBridge interacts with third-party streaming services using authorized APIs.

Security considerations include:

- secure authentication flows
- protection of account tokens
- secure API communication
- minimal storage of user data

Sensitive information must be handled according to security best practices.

---

# 12. System Architecture (Conceptual)

MusicBridge consists of several high-level components.

### Client Applications

User-facing applications where users interact with the platform.

Examples may include:

- mobile apps
- web applications

---

### Application Backend

The backend service is responsible for:

- user management
- playlist sharing logic
- playlist conversion
- social features
- messaging

---

### Streaming Service Integrations

MusicBridge communicates with streaming platforms through official APIs.

These integrations allow the system to:

- retrieve playlists
- search tracks
- create playlists
- add tracks to playlists

---

### Background Processing

Playlist conversions may require asynchronous processing.

Background jobs can handle:

- track matching
- playlist creation
- large playlist processing

---

# 13. Scalability Considerations

Several parts of the system may become performance bottlenecks.

Examples include:

- track matching
- playlist conversions
- API rate limits from streaming services

Possible strategies for scaling include:

- caching common track mappings
- batching conversion jobs
- asynchronous background workers

---

# 14. Potential Challenges

Several challenges may arise during development.

### API Limitations

Streaming services may impose limits on:

- API usage
- playlist creation
- rate limits

### Track Matching Accuracy

Track metadata differs across platforms.

Incorrect matches may occasionally occur.

### Regional Availability

Songs available on one platform may not exist on another in certain regions.

### Social Platform Moderation

If MusicBridge grows into a social platform, moderation tools may be required.

---

# 15. Development Roadmap

## Phase 1: Core MVP

- user accounts
- streaming service connections
- playlist retrieval
- playlist sharing
- cross-platform playlist conversion

---

## Phase 2: Expanded Integrations

- additional streaming service support
- improved track matching

---

## Phase 3: Social Platform

- following system
- user feeds
- playlist posts
- messaging

---

## Phase 4: Creator Ecosystem

- artist profiles
- playlist promotion
- creator analytics

---

# 16. Success Metrics

The success of MusicBridge can be measured through:

- number of playlist shares
- playlist conversion success rate
- active users
- user retention
- engagement on social features

---

# 17. Future Expansion

Possible future expansions include:

- collaborative playlists across services
- AI-based music recommendations
- playlist analytics
- cross-platform listening statistics

---

---

# 18. Implementation Architecture

MusicBridge is implemented as a **fully client-side mobile application** with no custom backend server. All backend services are provided by Supabase (a hosted PostgreSQL + Auth + realtime platform). Streaming service API calls are made directly from the mobile client using user-owned OAuth tokens.

## Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                  React Native App (Expo)                 │
│                                                         │
│  ┌──────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │  Screens  │  │   Hooks   │  │    Components       │   │
│  │ (Expo     │  │ useAuth   │  │ PlaylistModal       │   │
│  │  Router)  │  │ useFriends│  │ ShareModal          │   │
│  │           │  │ useLibrary│  │ FriendPickerModal   │   │
│  │ home      │  │ useShared │  │ LibraryPlaylist...  │   │
│  │ friends   │  │  Items    │  │ SongCard            │   │
│  │ library   │  └───────────┘  │ PlaylistCard        │   │
│  │ profile   │                 └────────────────────┘   │
│  └──────────┘                                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                  lib/                            │   │
│  │  supabase.ts  spotify.ts  appleMusic.ts  ytMusic │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────────┐
         ▼                 ▼                       ▼
   ┌──────────┐   ┌─────────────────┐   ┌──────────────────┐
   │ Supabase │   │  Spotify Web API │   │  YouTube Data    │
   │  (Auth + │   │  v1              │   │  API v3 +        │
   │ Postgres)│   │                 │   │  Apple Music API │
   └──────────┘   └─────────────────┘   └──────────────────┘
```

## Key Architecture Decisions

- **No custom server**: All business logic runs on the client. Supabase handles authentication, the database, and Row Level Security (RLS) policy enforcement.
- **PKCE OAuth on device**: Spotify and Google (YouTube Music) OAuth flows use PKCE, initiated from the device via `expo-auth-session`. Apple Music uses `expo-web-browser` to open a hosted MusicKit JS page.
- **Tokens stored in Supabase**: All third-party OAuth tokens are stored in the `public.users` table, protected by RLS so only the token owner can read or write them.
- **Playlist conversion runs client-side**: When a recipient opens a shared playlist, their device searches for each track on their primary streaming service and creates the playlist via that service's API — no server is involved.

---

# 19. Repository Structure

```
musicbridge/
├── app/                        — Expo Router file-based screens
│   ├── _layout.tsx             — Root layout: wraps app in AuthProvider + SafeAreaProvider
│   ├── index.tsx               — Splash/loading screen while auth resolves
│   ├── (auth)/
│   │   ├── login.tsx           — Email/password login screen
│   │   └── register.tsx        — Multi-step registration: credentials → primary service
│   └── (tabs)/
│       ├── _layout.tsx         — Tab bar definition (Ionicons)
│       ├── home.tsx            — Feed of received shared items (songs + playlists)
│       ├── friends.tsx         — Friends list, pending requests, user search
│       ├── library.tsx         — User's streaming library (playlists, saved songs, artists)
│       └── profile.tsx         — Profile info, music service connections, sign-out
│
├── components/                 — Reusable UI components
│   ├── SongCard.tsx            — Card for a shared song
│   ├── PlaylistCard.tsx        — Card for a shared playlist
│   ├── PlaylistModal.tsx       — Playlist detail + "Add to [service]" conversion UI
│   ├── ShareModal.tsx          — Song search + share-to-friend modal
│   ├── FriendListItem.tsx      — Friend row with share/accept/decline actions
│   ├── FriendPickerModal.tsx   — Reusable friend picker with optional message
│   ├── LibraryPlaylistDetailModal.tsx — Playlist track list from user's library
│   ├── MusicServiceButton.tsx  — Connect/disconnect button per music service
│   └── ServiceBadge.tsx        — Colored dot badge for each music service
│
├── hooks/                      — React custom hooks
│   ├── useAuth.tsx             — AuthContext provider + hook (session, user, signIn/Out/Up)
│   ├── useFriends.ts           — Friends list, pending requests, user search
│   ├── useSharedItems.ts       — Received shared items feed, markAsOpened
│   └── useLibrary.ts           — Streaming library (playlists, saved tracks, followed artists)
│
├── lib/                        — Service integrations + utilities
│   ├── supabase.ts             — Supabase client with AsyncStorage session persistence
│   ├── spotify.ts              — Spotify OAuth, token refresh, search, playlist CRUD, library
│   ├── appleMusic.ts           — Apple Music auth, search, playlist CRUD, library
│   ├── youtubeMusic.ts         — Google/YouTube OAuth, search, playlist CRUD, library
│   └── utils.ts                — withTimeout(), cleanArtistName()
│
├── types/
│   └── index.ts                — All TypeScript types (User, SharedItem, Track, LibraryPlaylist, etc.)
│
├── supabase/
│   └── migrations/
│       └── 001_initial.sql     — Full PostgreSQL schema with RLS policies and indexes
│
├── assets/                     — App icons and images
├── .env.example                — Required environment variable names (no values)
├── app.json                    — Expo app configuration
└── package.json                — Dependencies
```

---

# 20. Backend Implementation

MusicBridge uses **Supabase as its backend-as-a-service** and has no custom server process.

## Backend Language / Framework

- No custom backend language or framework.
- All server-side enforcement is handled by **Supabase PostgreSQL** with Row Level Security policies.
- Client is written in **TypeScript** (React Native / Expo).

## Request Flow

```
User Action → React Native Screen
    → Custom Hook (useSharedItems / useFriends / useLibrary)
    → lib/supabase.ts (Supabase JS client) OR lib/spotify|appleMusic|youtubeMusic.ts
    → Supabase REST API / Streaming Service API
    → Response parsed and stored in React state
```

## Authentication

Handled entirely by Supabase Auth using email + password (`signInWithPassword`). On registration, `supabase.auth.signUp()` is called with `options.data.username` and `options.data.display_name`. A Supabase trigger (`on_auth_user_created`, referenced in `useAuth.tsx`) creates the corresponding `public.users` profile row automatically.

The `AuthProvider` context (in `hooks/useAuth.tsx`) listens to `supabase.auth.onAuthStateChange` to keep the session in sync. Sessions are persisted between app launches via `AsyncStorage`.

## Playlist Sharing

1. Sender searches their primary service via `ShareModal.tsx` (songs) or `LibraryPlaylistDetailModal.tsx` (playlists).
2. The sender's device resolves the track ID on their own service only.
3. A row is inserted into `public.shared_items` in Supabase with the sender's service ID, track metadata, and optional message. IDs for other services are `null` at insert time.
4. The recipient's home feed (`home.tsx` via `useSharedItems`) fetches items from `shared_items` where `recipient_id = auth.uid()`.

## Playlist Conversion

Conversion is **entirely client-side**, triggered when the recipient taps "Add to [service]" in `PlaylistModal.tsx`. See section 23 for full details.

## Streaming Service API Communication

All calls to Spotify, Apple Music, and YouTube Music APIs are made directly from the client device using the user's stored OAuth tokens. The tokens are fetched from Supabase (RLS-protected) and automatically refreshed if expired before each API call.

---

# 21. Authentication System

## MusicBridge User Authentication

- Provider: **Supabase Auth** (email + password)
- Session storage: **AsyncStorage** (persists across app restarts)
- Auto token refresh: enabled via Supabase client config (`autoRefreshToken: true`)
- `detectSessionInUrl: false` is set (required for React Native — disables web URL-based session detection)

### Auth Flow

```
Register → supabase.auth.signUp({ email, password, options.data: { username, display_name } })
         → Supabase trigger creates public.users row
         → User selects primary_service (stored in public.users)
         → Redirect to (tabs)/home

Login    → supabase.auth.signInWithPassword({ email, password })
         → fetchUserProfile() loads the public.users row
         → Redirect to (tabs)/home

Sign Out → supabase.auth.signOut({ scope: 'local' })
         → Session cleared from AsyncStorage
```

## Streaming Service OAuth

### Spotify

- Flow: **PKCE Authorization Code** via `expo-auth-session`
- Authorization endpoint: `https://accounts.spotify.com/authorize`
- Token endpoint: `https://accounts.spotify.com/api/token`
- Scopes: `user-read-private`, `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`, `user-library-read`, `user-follow-read`
- Redirect URI: `musicbridge://spotify-callback`
- Tokens stored in: `public.users.spotify_access_token`, `spotify_refresh_token`, `spotify_token_expiry`

### Apple Music

- Flow: **MusicKit JS** — a hosted web page (URL set via `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL`) is opened in `expo-web-browser`. That page calls `Music.authorize()` and redirects back to `musicbridge://apple-music-callback?token=<userToken>`.
- Token stored in: `public.users.apple_music_user_token`
- No expiry — Apple Music user tokens do not expire in the same way as OAuth access tokens.
- Note: Requires a server-signed Apple Developer JWT (`EXPO_PUBLIC_APPLE_DEVELOPER_TOKEN`) to authenticate all API requests.

### YouTube Music

- Flow: **PKCE Authorization Code** via `expo-auth-session` with Google OAuth 2.0
- Authorization endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
- Token endpoint: `https://oauth2.googleapis.com/token`
- Scopes: `https://www.googleapis.com/auth/youtube`
- Redirect URI: reverse-DNS format from the Google Client ID (e.g., `com.googleusercontent.apps.<id>:/oauth2redirect/google`)
- Tokens stored in: `public.users.youtube_access_token`, `youtube_refresh_token`, `youtube_token_expiry`

## Token Refresh

Spotify and YouTube tokens are refreshed automatically in `getSpotifyAccessToken()` and `getYouTubeAccessToken()` respectively. The logic is:

1. Fetch stored token + expiry from Supabase.
2. If token expires within 60 seconds, call the token endpoint with the refresh token.
3. Store the new access token (and optionally new refresh token) back to Supabase.

Apple Music user tokens do not have an OAuth refresh mechanism implemented.

---

# 22. Streaming Service Integrations

## Spotify (`lib/spotify.ts`)

**APIs Used**: Spotify Web API (`https://api.spotify.com/v1`)

| Function | Endpoint | Purpose |
|---|---|---|
| `connectSpotify` | `accounts.spotify.com/authorize` | PKCE OAuth connect |
| `getSpotifyAccessToken` | `accounts.spotify.com/api/token` | Refresh token |
| `searchTrack` | `GET /v1/search?type=track` | Single-track match for conversion |
| `searchTracks` | `GET /v1/search?type=track` | Free-form search (up to 10 results) |
| `getSpotifyUserId` | `GET /v1/me` | Fetch Spotify user ID for playlist creation |
| `createPlaylist` | `POST /v1/users/{id}/playlists`, `POST /v1/playlists/{id}/tracks` | Create playlist and add tracks |
| `getUserPlaylists` | `GET /v1/me/playlists?limit=50` | Library: user's playlists |
| `getPlaylistTracks` | `GET /v1/playlists/{id}/tracks` | Paginated playlist track fetch (100/page) |
| `getSavedTracks` | `GET /v1/me/tracks?limit=50` | Library: liked songs |
| `getFollowedArtists` | `GET /v1/me/following?type=artist` | Library: followed artists |

**Rate Limit Handling**: `searchTrack` retries up to 3 times on 429 responses, respecting the `Retry-After` header. If the wait exceeds 15 seconds (indicating developer-mode quota exhaustion), it throws `spotify_rate_limit_exceeded`.

**Deep Links**: `spotify:track:<id>` and `spotify:playlist:<id>`, with HTTPS fallbacks.

---

## Apple Music (`lib/appleMusic.ts`)

**APIs Used**: Apple Music API (`https://api.music.apple.com/v1`), MusicKit JS (for auth)

Every request requires two headers:
- `Authorization: Bearer <APPLE_DEVELOPER_TOKEN>` — server-signed JWT
- `Music-User-Token: <userToken>` — obtained from MusicKit JS auth

| Function | Endpoint | Purpose |
|---|---|---|
| `connectAppleMusic` | Hosted MusicKit page + deep link callback | Open MusicKit auth session |
| `searchTrack` | `GET /v1/catalog/us/search?types=songs` | Single-track match for conversion |
| `searchTracks` | `GET /v1/catalog/us/search?types=songs` | Free-form search (up to 20 results) |
| `createPlaylist` | `POST /v1/me/library/playlists` | Create playlist with tracks in one request |
| `getUserPlaylists` | `GET /v1/me/library/playlists?limit=100` | Library: user's playlists |
| `getPlaylistTracks` | `GET /v1/me/library/playlists/{id}/tracks` | Playlist track fetch (up to 100) |
| `getSavedSongs` | `GET /v1/me/library/songs?limit=100` | Library: saved songs |

**Artwork URLs**: Apple Music returns artwork URLs with `{w}` and `{h} ` placeholders. `resolveArtworkUrl(url, size)` replaces these with a concrete pixel value.

**Deep Links**: `music://music.apple.com/us/album/<id>`, with HTTPS fallback.

---

## YouTube Music (`lib/youtubeMusic.ts`)

**APIs Used**: YouTube Data API v3 (`https://www.googleapis.com/youtube/v3`)

| Function | Endpoint | Purpose |
|---|---|---|
| `connectYouTubeMusic` | `accounts.google.com/o/oauth2/v2/auth` | PKCE OAuth via Google |
| `getYouTubeAccessToken` | `oauth2.googleapis.com/token` | Refresh access token |
| `searchTrack` | `GET /search?type=video&videoCategoryId=10&topicId=/m/04rlf` | Single-track match for conversion |
| `searchTracks` | `GET /search?type=video&videoCategoryId=10` | Free-form search (up to 25 results) |
| `createPlaylist` | `POST /playlists`, `POST /playlistItems` (per video) | Create playlist then add videos one by one |
| `getUserPlaylists` | `GET /playlists?mine=true&maxResults=50` | Library: user's playlists |
| `getPlaylistTracks` | `GET /playlistItems?playlistId=<id>` | Paginated playlist items |
| `getLikedVideos` | Calls `getPlaylistTracks` with playlist ID `"LL"` | Library: liked videos (YouTube special playlist) |

**Search Heuristic**: For track matching, results are filtered to the Music topic (`topicId=/m/04rlf`, `videoCategoryId=10`). The code prefers "Artist - Topic" channel results (YouTube Music official audio), then results without "music video", "lyric", "live", or "official video" in the title. This reduces mismatches on music videos and live recordings.

**Artist Name Cleaning**: The ` - Topic` suffix on YouTube channel names is stripped via `cleanArtistName()` in `lib/utils.ts` before using the name as a search query on other platforms.

**Deep Links**: `youtubemusic://watch?v=<id>&vType=audio`, with `vnd.youtube://` and HTTPS fallbacks.

---

# 23. Playlist Conversion Pipeline

Playlist conversion is executed **entirely on the recipient's device**, triggered when they tap "Add to [service]" in `PlaylistModal.tsx`.

## Step-by-Step Flow

### 1. Retrieve Playlist Tracks

When a `SharedItem` of type `playlist` is stored in Supabase, the `tracks` field contains a JSONB array of objects:

```json
[
  {
    "title": "Song Name",
    "artist": "Artist Name",
    "spotify_id": "abc123",
    "apple_music_id": null,
    "youtube_music_id": null
  },
  ...
]
```

IDs for services other than the sender's are `null`. These are resolved lazily by the recipient.

### 2. Track Matching

`PlaylistModal.tsx` iterates through the `tracks` array. For each track:

1. Check if the track already has a pre-resolved ID for the recipient's primary service (e.g., `spotify_id` is already set).
2. If not, call the appropriate `searchTrack(userId, title, artist)` function for the recipient's service.
3. The search builds a query from `title + cleanArtistName(artist)` and returns the best match ID.

Track searches are executed in **chunks of 3** with a 2-second delay between chunks to reduce rate-limit pressure. Each chunk has a 60-second timeout.

### 3. Playlist Creation

After all track IDs are resolved:

1. Any tracks that could not be matched are silently dropped.
2. If zero tracks were matched, the user is shown a "Not Available" alert.
3. Otherwise, the appropriate `createPlaylist(userId, name, trackIds)` is called:
   - **Spotify**: `POST /v1/users/{id}/playlists` → `POST /v1/playlists/{id}/tracks` (batch of URIs)
   - **Apple Music**: `POST /v1/me/library/playlists` (tracks embedded in the request body)
   - **YouTube Music**: `POST /playlists` then sequential `POST /playlistItems` for each video ID

### 4. Execution Location

All of the above runs **synchronously on the recipient's device** in response to a button tap. There is no background worker or server-side conversion process.

---

# 24. Database Schema

MusicBridge uses a **Supabase PostgreSQL** database. The schema is defined in `supabase/migrations/001_initial.sql`.

## Enum Types

```sql
music_service      — 'spotify' | 'apple_music' | 'youtube_music'
friendship_status  — 'pending' | 'accepted' | 'declined'
shared_item_type   — 'song' | 'playlist'
```

---

## Table: `public.users`

Extends `auth.users`. One row per registered MusicBridge user.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | FK → `auth.users.id`, primary key |
| `username` | `text` | Unique |
| `display_name` | `text` | |
| `avatar_url` | `text` | Nullable |
| `primary_service` | `music_service` | User's home streaming service |
| `spotify_access_token` | `text` | Nullable |
| `spotify_refresh_token` | `text` | Nullable |
| `spotify_token_expiry` | `timestamptz` | Nullable |
| `apple_music_user_token` | `text` | Nullable; no expiry |
| `youtube_access_token` | `text` | Nullable |
| `youtube_refresh_token` | `text` | Nullable |
| `youtube_token_expiry` | `timestamptz` | Nullable |
| `created_at` | `timestamptz` | Default `now()` |

**RLS**: Users can insert their own row, read all rows (needed for friend search), and update only their own row.

---

## Table: `public.friendships`

Tracks friend relationships between users.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `requester_id` | `uuid` | FK → `public.users.id` |
| `addressee_id` | `uuid` | FK → `public.users.id` |
| `status` | `friendship_status` | Default `'pending'` |
| `created_at` | `timestamptz` | Default `now()` |

**Constraint**: `UNIQUE (requester_id, addressee_id)` — one friendship record per pair.

**RLS**: Both participants can read and update the record. Only the requester can insert.

**Indexes**: `friendships_requester_idx`, `friendships_addressee_idx`

---

## Table: `public.shared_items`

Stores songs and playlists shared between users.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | Primary key |
| `sender_id` | `uuid` | FK → `public.users.id` |
| `recipient_id` | `uuid` | FK → `public.users.id` |
| `type` | `shared_item_type` | `'song'` or `'playlist'` |
| `title` | `text` | Song or playlist title |
| `artist` | `text` | Nullable (null for playlists) |
| `cover_image_url` | `text` | |
| `spotify_id` | `text` | Nullable; Spotify track ID |
| `apple_music_id` | `text` | Nullable; Apple Music track ID |
| `youtube_music_id` | `text` | Nullable; YouTube video ID |
| `spotify_playlist_id` | `text` | Nullable |
| `apple_music_playlist_id` | `text` | Nullable |
| `youtube_music_playlist_id` | `text` | Nullable |
| `tracks` | `jsonb` | Array of `{title, artist, spotify_id, apple_music_id, youtube_music_id}` |
| `message` | `text` | Optional sender message |
| `opened` | `boolean` | Default `false` |
| `created_at` | `timestamptz` | Default `now()` |

**RLS**: Sender and recipient can read. Only sender can insert. Only recipient can update (e.g., mark as opened).

**Indexes**: `shared_items_recipient_idx` (on `recipient_id, created_at DESC`), `shared_items_sender_idx`

---

# 25. API Endpoints

MusicBridge uses no custom HTTP API server. The "API surface" is entirely composed of:

1. **Supabase PostgREST** — auto-generated REST endpoints from the PostgreSQL schema, accessed via the Supabase JS client.
2. **Direct calls to streaming service APIs** — made from the client device.

## Supabase (PostgREST) Operations Used

| Operation | Table | Trigger |
|---|---|---|
| `SELECT *` + join sender | `shared_items` | Load home feed |
| `INSERT` | `shared_items` | Send a song or playlist |
| `UPDATE opened=true` | `shared_items` | Mark item as opened |
| `SELECT *` + join requester/addressee | `friendships` | Load friends list |
| `INSERT` | `friendships` | Send friend request |
| `UPDATE status` | `friendships` | Accept or decline request |
| `SELECT id, username, display_name, avatar_url, primary_service` | `users` | Search users |
| `SELECT *` | `users` | Load own profile |
| `UPDATE primary_service` | `users` | Set primary streaming service |
| `UPDATE spotify_*/apple_music_*/youtube_*` | `users` | Store/clear OAuth tokens |

## Streaming Service Endpoints Called Directly from the Client

See section 22 (Streaming Service Integrations) for the full list of external API endpoints.

---

# 26. Background Jobs / Workers

**MusicBridge does not currently use any background jobs or asynchronous workers.**

Playlist conversion, track matching, and playlist creation all execute synchronously on the client device in response to user actions. There is no job queue, message broker, or scheduled task infrastructure.

This is noted in section 15 (Current Limitations) as a scalability concern for large playlists.

---

# 27. Environment Configuration

All environment variables are prefixed with `EXPO_PUBLIC_` (exposed to the React Native bundle at build time). The required variables are listed in `.env.example`.

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) API key |
| `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` | Spotify developer app client ID |
| `EXPO_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID (for YouTube Music) |
| `EXPO_PUBLIC_GOOGLE_REDIRECT_URI` | Google OAuth redirect URI (Expo auth proxy format) |
| `EXPO_PUBLIC_APPLE_TEAM_ID` | Apple Developer team ID |
| `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL` | URL of the hosted MusicKit JS auth page |
| `EXPO_PUBLIC_APPLE_DEVELOPER_TOKEN` | Apple Music developer JWT (signed with MusicKit private key) |

**Security note**: The Apple Developer Token is currently exposed as a client-side env var. The `.env.example` comments warn that for production this token should be generated server-side to avoid exposing the private key.

---

# 28. Deployment

## Current State

The project is a **local development build** using Expo. No production deployment infrastructure is currently configured in the repository.

## Running Locally

```bash
npx expo start         # Start Metro bundler
npx expo run:ios       # Native iOS build
npx expo run:android   # Native Android build
```

**Note**: `npm install --legacy-peer-deps` is required due to a `react-dom` peer dependency conflict with Expo SDK 55 / React 19.

## External Dependency: Apple Music Auth Page

Apple Music authentication requires a **separately hosted MusicKit JS web page** (e.g., on Vercel or Netlify). This page is not included in the repository. Its URL must be set via `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL`.

## CI/CD

No CI/CD pipeline is configured in the repository.

---

# 29. Current Limitations

The following limitations are directly observable in the current codebase:

### 1. Playlist Conversion is Synchronous and Client-Side
Playlist conversion runs entirely on the recipient's device with no background processing. Large playlists (100+ tracks) can cause the UI to block for minutes. A 60-second timeout per chunk of 3 tracks partially mitigates this but does not fully solve it.

### 2. Spotify Developer Mode Rate Limits
`searchTrack` in `lib/spotify.ts` includes explicit comments and error handling for Spotify's development-mode quota. When a Spotify app is in "Development Mode," Spotify enforces a daily search quota. Converting large playlists can exhaust this quota, requiring a 12-hour wait or a new Spotify app registration.

### 3. Track Matching Uses Title + Artist Only
The current matching strategy concatenates `title + cleanArtistName(artist)` and takes the first result. There is no ISRC matching, duration comparison, or fuzzy matching. Tracks with common titles or unusual metadata may match incorrectly or fail to match.

### 4. Apple Music Developer Token Exposed Client-Side
The Apple Music Developer Token (a signed JWT) is stored as `EXPO_PUBLIC_APPLE_DEVELOPER_TOKEN`, making it visible in the app bundle. The `.env.example` acknowledges this and flags it as insecure for production.

### 5. Apple Music Playlist Track Count Not Available in List View
In `getUserPlaylists()` for Apple Music (`lib/appleMusic.ts`), `trackCount` is set to `0` for all playlists because the Apple Music library playlists list endpoint does not return item counts. The count is only available after fetching the tracks for a specific playlist.

### 6. YouTube Music Playlist Creation is Sequential
YouTube Music playlist creation adds each video one at a time via individual `POST /playlistItems` requests (no batch endpoint available). This is slow for large playlists and has no rate-limit handling.

### 7. Apple Music Followed Artists Not Implemented
`useLibrary.ts` returns an empty array for `followedArtists` when the primary service is `apple_music` or `youtube_music`. Only Spotify exposes a followed-artists API that is currently integrated.

### 8. Track IDs Not Pre-Resolved Cross-Service at Share Time
When a sender shares a song or playlist, only their own service's track ID is stored. IDs for other services are left `null` and resolved lazily by each recipient. This means every recipient performs their own search, which multiplies API usage and conversion time.

### 9. No Real-Time Updates
The home feed and friends list do not use Supabase real-time subscriptions. Users must manually pull-to-refresh to see new shared items or friend requests.

### 10. Search is Hardcoded to US Storefront for Apple Music
`searchTrack` and `searchTracks` in `lib/appleMusic.ts` use the US catalog endpoint (`/v1/catalog/us/search`). Users in other regions may receive incorrect or no results for regionally restricted content.
