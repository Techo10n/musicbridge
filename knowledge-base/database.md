# Database

MusicBridge uses **Supabase** (hosted PostgreSQL) with Row Level Security.

---

## Migrations

| File | Purpose |
|---|---|
| `001_initial.sql` | Full schema: enums, tables, RLS policies, indexes, auth trigger |
| `003_conversion_progress.sql` | Adds `conversion_status` + `tracks_processed` to `shared_items` |

---

## Key Tables

### `public.users`

Extends Supabase Auth. Created automatically by an `on_auth_user_created` trigger on `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | matches `auth.users.id` |
| `username` | text | unique |
| `display_name` | text | |
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

### `public.friendships`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `requester_id` | uuid | FK → users.id |
| `addressee_id` | uuid | FK → users.id |
| `status` | enum | `pending`, `accepted`, `declined` |
| `created_at` | timestamptz | |

**RLS**: Both requester and addressee can read. Only addressee can update status. Only requester can insert.

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

## Auth Trigger

`on_auth_user_created` fires on `auth.users` insert and creates the corresponding `public.users` row using `username` and `display_name` from `options.data`.

---

## Related Pages

- [[auth]] — how tokens are used and refreshed
- [[architecture]] — how the client reads/writes the DB
- [[playlist-conversion]] — how `shared_items` is used during conversion
