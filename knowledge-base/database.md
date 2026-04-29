# Database

MusicBridge uses **Supabase** (hosted PostgreSQL) with Row Level Security.

---

## Migrations

| File | Purpose |
|---|---|
| `001_initial.sql` | Full schema: enums, tables, RLS policies, indexes, auth trigger |
| `003_conversion_progress.sql` | Adds `conversion_status` + `tracks_processed` to `shared_items` |
| `004_follows_and_profile.sql` | Drops `friendships`, creates `follows` (directed), adds `bio`/`favorite_song` to `users`, creates `avatars` storage bucket |
| `005_push_tokens.sql` | Push token storage for Expo notifications |
| `006_reel_import_history.sql` | Durable saved reel song-list history |

---

## Key Tables

### `public.users`

Extends Supabase Auth. Created automatically by an `on_auth_user_created` trigger on `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | matches `auth.users.id` |
| `username` | text | unique |
| `display_name` | text | |
| `avatar_url` | text | public URL from Supabase Storage `avatars` bucket |
| `bio` | text | nullable, max 160 chars (enforced in UI) |
| `favorite_song` | jsonb | `{ title, artist, service, service_id, cover_url }` |
| `primary_service` | enum | `spotify`, `apple_music`, `youtube_music` |
| `spotify_access_token` | text | RLS-protected |
| `spotify_refresh_token` | text | RLS-protected |
| `spotify_token_expiry` | timestamptz | |
| `apple_music_user_token` | text | RLS-protected |
| `youtube_access_token` | text | RLS-protected |
| `youtube_refresh_token` | text | RLS-protected |
| `youtube_token_expiry` | timestamptz | |

**RLS**: Users can only read/write their own row.

---

### `public.follows`

Directed follow graph. No approval step — instant follow (Instagram model).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `follower_id` | uuid | FK → users.id |
| `following_id` | uuid | FK → users.id |
| `created_at` | timestamptz | |

Unique constraint on `(follower_id, following_id)`. Check constraint: `follower_id <> following_id`.

**RLS**: Anyone can read. Only the follower can insert (their own follows). Only the follower can delete (unfollow).

---

### `public.shared_items`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `sender_id` | uuid | FK → users.id |
| `recipient_id` | uuid | FK → users.id |
| `item_type` | enum | `song`, `playlist` |
| `title` | text | track/playlist title |
| `artist` | text | |
| `album` | text | |
| `cover_url` | text | |
| `message` | text | optional note from sender |
| `spotify_id` | text | null if sender isn't Spotify |
| `apple_music_id` | text | null if sender isn't Apple Music |
| `youtube_id` | text | null if sender isn't YouTube Music |
| `sender_service` | enum | which service the sender used |
| `is_opened` | boolean | |
| `conversion_status` | text | (added in 003) |
| `tracks_processed` | int | (added in 003) |
| `created_at` | timestamptz | |

**RLS**: Sender can insert. Recipient can read and update `is_opened`.

---

### `public.reel_imports`

Saved reel import history, one row per saved reel URL per user.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `user_id` | uuid | FK → users.id |
| `title` | text | generated display title |
| `reel_url` | text | source reel URL |
| `created_at` | timestamptz | |

Unique constraint on `(user_id, reel_url)`.

**RLS**: Owner-only select/insert/update/delete.

### `public.reel_import_songs`

Ordered songs scraped from a saved reel import.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `reel_import_id` | uuid | FK → reel_imports.id |
| `position` | int | display order |
| `title` | text | |
| `artist` | text | |
| `cover_url` | text | nullable |
| `created_at` | timestamptz | |

Unique constraint on `(reel_import_id, position)`.

**RLS**: Owner-only through the parent `reel_imports` row.

---

## Auth Trigger

`on_auth_user_created` fires on `auth.users` insert and creates the corresponding `public.users` row using `username` and `display_name` from `options.data`.

---

## Related Pages

- [[auth]] — how tokens are used and refreshed
- [[architecture]] — how the client reads/writes the DB
- [[playlist-conversion]] — how `shared_items` is used during conversion
