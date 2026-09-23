# MusicBridge

**Author**: Zechariah Frierson | **Status**: MVP in Development | **Date**: March 2026

Cross-platform music sharing app. Users on Spotify, Apple Music, and YouTube Music can share songs and playlists — MusicBridge automatically recreates them on the recipient's streaming service.

Long-term vision: social music platform with feeds, following, collaborative playlists, and artist tools.

---

## Tech Stack

| | |
|---|---|
| Framework | Expo SDK 57, React Native 0.86.3, React 19.2.3 |
| Routing | Expo Router (file-based) |
| Backend | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Language | TypeScript |
| Node.js | 22.13.0 via `.nvmrc` |

> `npm install --legacy-peer-deps` required (react-dom peer dep conflict with Expo SDK 57 / React 19).
> Because peers are not enforced, anything `jest-expo` needs must be a direct devDependency —
> see `@react-native/jest-preset`.

---

## Running Locally

```bash
nvm use                    # or install/use Node 22.13.0
cp .env.example .env.local   # fill in credentials (see SETUP.md)
npx expo start --dev-client  # Metro bundler for the custom iOS dev client
npx expo run:ios             # iOS native build
npx expo run:android         # Android native build
npm run typecheck            # app TypeScript check (excludes Deno edge functions)
npm test                     # Jest + jest-expo test suite
npm run verify               # typecheck + lint + tests
supabase db push             # apply new Supabase migrations to linked dev  project
eas env:push production --path .env.local --force  # sync EXPO_PUBLIC_* vars before TestFlight builds
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
│   │   ├── _layout.tsx         Stack for the signed-out routes
│   │   ├── welcome.tsx         Apple / Google / email, gated by EXPO_PUBLIC_AUTH_PROVIDERS
│   │   ├── email.tsx           Email entry, sends the six-digit code
│   │   ├── code.tsx            Code entry, resend
│   │   └── login.tsx           Password fallback for accounts that predate passwordless
│   ├── (onboarding)/
│   │   ├── _layout.tsx         Stack; no swipe-back, each step depends on the last
│   │   ├── service.tsx         Where do you listen: sets primary service and connects it
│   │   ├── profile.tsx         Photo, display name, username with live availability
│   │   ├── people.tsx          Invite link and suggested follows; skippable
│   │   └── permissions.tsx     Notifications checklist; skippable
│   ├── song/
│   │   └── [id].tsx            A shared song: art, note, reactions, and every way to open it
│   └── (tabs)/
│       ├── _layout.tsx         Tab bar; the centre button opens the share composer
│       ├── home.tsx            Feed with the album art as the hero: a "new for you" strip of
│       │                       unopened shares, then direct shares and public drops from people you
│       │                       follow, with reactions always visible. Friends / For you tabs.
│       ├── friends.tsx         People tab with auto-search, suggested follows, and data-based taste match scores
│       ├── library.tsx         User's streaming library with sort controls, an All Songs pseudo-playlist, clickable empty filters, deduped playlist-track-backed search, and placeholder artist-page actions
│       ├── notifications.tsx   Notification inbox for recent shares and new followers
│       ├── profile.tsx         Profile + avatar picker, data-derived taste tags, share profile, favorite-song search
│       ├── settings.tsx        Settings screen with keyboard-aware profile editing, streaming service management, avatar upload, password reset, persisted toggles, and placeholder legal/rating rows
│       └── share.tsx           Placeholder route backing the center tab pill; redirects to People
├── components/
│   ├── ui/                     The design system's primitives — screens compose from these only
│   │   ├── index.ts            Barrel export; import everything from '../components/ui'
│   │   ├── Txt.tsx             Themed text; every style comes from the type scale
│   │   ├── Button.tsx          primary / secondary / ghost / danger, with loading and icon
│   │   ├── Field.tsx           Text input with label, hint, error, and leading icon
│   │   ├── Sheet.tsx           Bottom sheet with scrim, handle, and header
│   │   ├── Toast.tsx           ToastProvider + useToast(); success and failure feedback
│   │   ├── EmptyState.tsx      Icon, title, body, and one clear action
│   │   ├── Skeleton.tsx        Pulsing placeholder block
│   │   ├── ListRow.tsx         Leading art/avatar, two lines, trailing action
│   │   ├── SegmentedTabs.tsx   Underline (sections) and pill (filters) variants
│   │   ├── CodeInput.tsx       Six boxes over one field, so paste and autofill work
│   │   ├── ServiceBadge.tsx    ServiceDot / ServiceChip, brand-colored
│   │   └── core.tsx            Avatar, Chip, SectionTitle, Wordmark, AppBar, IconBtn, CoverArt, TasteBar
│   ├── PlaylistModal.tsx       Playlist detail + conversion UI; preserves in-flight progress/success and shows "Already In Library" when reopened later
│   ├── ShareModal.tsx          Search + share-to-friend modal
│   ├── FriendPickerModal.tsx   Reusable friend picker with optional message; refreshes mutual follows on open
│   ├── LibraryPlaylistDetailModal.tsx   Playlist tracks + inline share picker; refreshes mutual follows on share
│   ├── ShareComposer.tsx       Pick something, pick who, send. The only way a share is composed.
│   ├── MusicServiceButton.tsx  Connect/disconnect row for one streaming service
│   ├── OnboardingStep.tsx      One-question-per-screen scaffold: progress dots, title, footer
│   ├── FirstShareCard.tsx      One-time prompt on Home, dismissed per user
│   └── UserProfileModal.tsx    Another user's profile, taste match, and send-a-song entry point
├── hooks/
│   ├── useAuth.tsx             AuthContext + hook
│   ├── useFollows.ts           Following/follower graph, search, and suggested users
│   ├── useSharedItems.ts       Inbox fetch + realtime insert/update refresh
│   ├── useLibrary.ts           Playlists, saved tracks, followed artists; bounded/lazy playlist-track loading
│   ├── useReactions.ts         Emoji reactions with optimistic updates and rollback
│   ├── useProfileStats.ts      Top tracks/artists, recents, taste tags, pinned playlists
│   └── useNotifications.ts     Push registration + tap handler
├── lib/
│   ├── supabase.ts
│   ├── spotify.ts
│   ├── appleMusic.ts           Native Apple Music auth + Apple Music API
│   ├── youtubeMusic.ts
│   ├── notifications.ts        Register/unregister tokens, sendPushNotification helper
│   ├── theme.tsx               The design system: light/dark palettes, spacing/radius/type/elevation
│   │                           scales, ThemeProvider, useTheme(), makeStyles(). The only file that
│   │                           may name a color.
│   ├── services.ts             Streaming service names and helpers (serviceLabel, serviceLabelShort)
│   ├── sharing.ts              The one path that writes a share; owns the service-id rules
│   ├── authProviders.ts        Which sign-in buttons this build offers
│   └── utils.ts                withTimeout(), cleanArtistName(), cleanTitle(), timeAgo(), monthWeekLabel()
├── modules/
│   └── apple-music/
│       ├── index.ts            JS bridge for the local Expo module
│       └── ios/                Native iOS MusicKit / StoreKit module
├── types/index.ts
├── __tests__/
│   ├── utils.test.ts          Matching/utility helper coverage
│   ├── ui.test.tsx            Theme tokens, makeStyles caching, and UI primitive behavior
│   ├── services.test.ts       Service labels/colors, timeAgo, monthWeekLabel
│   ├── appearance.test.tsx    Light/dark preference: system-follow, override, persistence
│   ├── authProviders.test.ts  Which sign-in buttons a build offers
│   ├── username.test.ts       Username sanitizing and the rules migration 014 enforces
│   ├── sharing.test.ts        Service-id rules, one row per recipient, refusals
│   ├── shareComposer.test.tsx Picking content, picking people, sending
│   ├── useReactions.test.ts   Reaction hook state, optimistic updates, rollback
│   └── notifications.test.ts  Push notification helper behavior
├── test/
│   └── jest.setup.ts          Jest setup for React Native Testing Library
├── supabase/
│   ├── functions/
│   │   ├── convert-playlist/index.ts    Edge Function: server-side conversion + progress
│   │   └── send-notification/index.ts   Edge Function: Expo push delivery
│   └── migrations/
│       ├── 001_initial.sql
│       ├── 003_conversion_progress.sql
│       ├── 004_follows_and_profile.sql
│       ├── 005_push_tokens.sql
│       ├── 008_apple_music_playlist_url.sql
│       ├── 009_drop_reel_import.sql
│       ├── 010_restrict_user_token_access.sql
│       ├── 011_conversion_progress_table.sql
│       ├── 012_track_match_cache.sql
│       ├── 013_artist_channel_cache.sql
│       └── 014_oauth_signup_support.sql    Profile rows for OAuth signups; username_available()
└── .env.example
```

---

## Design System

Everything visual comes from `lib/theme.tsx`. **No file outside it may name a color.**

**Light or dark** is the user's choice, in Settings → Appearance: System, Light, or Dark. The choice
persists in AsyncStorage under `museaic_appearance`; `system` defers to the device. Read or change it
with `useAppearance()`. Both palettes define the same semantic
tokens — `bg`, `bgElev`, `surface`, `surfaceAlt`, `line`, `lineStrong`, `text` through `text4`,
`accent`, `accentInk`, `accentSoft`, `accentBorder`, `danger`, `success`, `warning`, `overlay`,
`skeleton`, `brandInk`, the toast trio, and the three service brand colors — so a screen written
against them works in either scheme without a branch.

```tsx
import { makeStyles, useTheme } from '../lib/theme';
import { Button, Txt } from '../components/ui';

function Example() {
  const s = useStyles();
  const { colors } = useTheme();          // only when you need a raw value, e.g. an icon color
  return (
    <View style={s.card}>
      <Txt variant="headline">Title</Txt>
      <Txt variant="caption" color="text3">Supporting line</Txt>
      <Button label="Send" onPress={send} />
    </View>
  );
}

const useStyles = makeStyles(({ colors, spacing, radius }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
}));
```

`makeStyles` builds one `StyleSheet` per scheme and caches it, so calling the hook costs the same as
reading a module-level sheet. `ThemeProvider` takes an optional `scheme` prop to pin a palette in tests.

**Rules that keep it coherent**

- Compose screens from `components/ui`. Reach for a raw `View`/`Text` only for layout.
- Type comes from the scale (`Txt variant=...`), never a bare `fontSize`.
- Service colors come from `serviceColor(colors, service)` or `<ServiceDot>`, never a literal.
- Content on a fill that stays dark in both schemes (service brand, photo scrim, switch knob) uses
  `brandInk`; content on the accent fill uses `accentInk`.
- Feedback is a toast (`useToast()`). `Alert` is only for destructive confirms.
- Every visible control does something, and every empty list renders an `EmptyState`.

**Typography.** Fraunces (`@expo-google-fonts/fraunces`) is the display face, used for the wordmark
and screen titles; body copy stays on the system face. Fonts load in `app/_layout.tsx` and a load
failure falls through to the system face rather than blocking the app.

**Changing native-facing config.** `ios/` is a committed native project, so editing `app.json` alone
does nothing — mirror the change into the native files by hand (see the vault's gotchas page). This
bit dark mode specifically: `Info.plist` pinned `UIUserInterfaceStyle = Light`, which makes
`useColorScheme()` report light no matter what the device is set to, so **System** appeared broken.
The key is now removed, but any build made before that still needs rebuilding to pick it up.

## Sharing

`lib/sharing.ts` is the only code that writes a `shared_items` row. Three screens used to do it
independently, with subtly different ideas about which service ids were safe to store, so a rule
fixed in one place stayed broken in the others.

It owns two rules that are easy to get wrong:

- **Only the sender's own service id is trustworthy.** The sender holds a token for one service, so
  that is the only id stored. The recipient re-resolves the rest against their own service.
- **A YouTube id is only stored when it came from an "Artist - Topic" channel.** Anything else is not
  a canonical Song, and an unverified id would deep-link the recipient to a music video or worse. No
  id is better, because no id makes their device search properly.

It also refuses a playlist whose track list came back empty. A share stores its tracks rather than a
live reference, so sending an empty one writes something the recipient can never recover and neither
side finds out.

`components/ShareComposer.tsx` is the only way a share is composed: pick something (search the
primary service, or Recent, or Playlists), pick who (multi-select from mutual follows), add a note,
send. It opens from the centre tab with nothing chosen, and from the library, the song screen, or
someone's profile with the content or the recipient already filled in.

**Public drops.** Sending to Everyone writes one row with a null `recipient_id` (migration 015),
visible to everyone who follows the sender. It is the same table, the same insert path and the same
card as a direct share, rather than a parallel "post" concept that would need its own conversion,
reactions and notifications.

Three consequences worth knowing:

- **A drop cannot be unread.** `opened` is a column on the row, and a drop has many viewers, so there
  is nothing per-person to mark. The unread count and the "new for you" strip only count direct shares.
- **A drop notifies nobody.** It is something to find in the feed, not an interruption for every
  follower.
- **Everyone and a named person are mutually exclusive** in the composer, or a follower picked both
  ways would see the same song twice.

The feed runs two queries rather than one `or()` filter: the direct one uses the recipient index and
the drops one uses the partial index from migration 015, where an or-filter across both would use
neither. Drops arrive on refresh and on focus rather than through realtime, because "from someone I
follow" is not something a realtime filter can express.

`app/song/[id].tsx` is where a shared song lands. It carries the art, the sender's note, reactions,
and one button per service, so opening a share finally goes somewhere in the app rather than
bouncing straight out to a streaming app.

---

## Testing and TDD

Production behavior changes should be test-first. Add or update a failing Jest test for the bug/feature, implement the smallest fix, then run the targeted test and `npm run verify` when feasible.

Test stack:

| Tool | Purpose |
|---|---|
| Jest + `jest-expo` | Expo/React Native test runner |
| React Native Testing Library | User-visible component and hook behavior |
| TypeScript | Static validation via `npm run typecheck` |

See `knowledge-base/testing-and-tdd.md` for the full workflow agents must follow.

`npm run typecheck` can sit quietly for a minute or two while TypeScript loads Expo/React Native declaration files. Wait for the final result before assuming it is hung.

Current baseline coverage includes utility matching, shared UI primitives, reaction-hook optimistic updates, and notification helpers.

---

## Architecture

No custom backend server. All logic runs on the client. Supabase handles auth, the database, and RLS. Streaming API calls go directly from the device using stored OAuth tokens.

- **On-device auth**: Spotify + Google via `expo-auth-session`; Apple Music via native iOS MusicKit / StoreKit in a local Expo module
- **Tokens in Supabase**: stored in `public.users`, RLS-protected (owner-only)
- **Playlist conversion**: runs in `supabase/functions/convert-playlist/` (Edge Function). Progress updates via Supabase Realtime. Client shows live progress bar.

---

## Authentication

### MusicBridge (Supabase)

Sign-in is passwordless. Three routes, all landing in the same place:

| Route | Mechanism | Needs |
|---|---|---|
| Apple | Native sheet via `expo-apple-authentication`, then `signInWithIdToken` | Sign In with Apple on the App ID, and the bundle id in Supabase's authorized client IDs. No client secret: Supabase verifies the token against Apple's public keys. |
| Google | `signInWithOAuth` opened with `expo-web-browser`, returning to `museaic://callback` | A **Web application** OAuth client whose redirect URI is the Supabase callback. The iOS client used for YouTube Music cannot be reused. |
| Email | Six-digit code via `signInWithOtp` / `verifyOtp` | Nothing beyond Supabase's built-in email auth. |

Which of the two social buttons render is controlled by `EXPO_PUBLIC_AUTH_PROVIDERS`, so a build
whose Supabase project has no provider configured never shows a button that would fail when tapped.
Apple is iOS-only, because only the native flow is set up. Email + password still works for accounts
that predate this, behind "Sign in with a password instead" on the welcome screen.

The Google callback reads both a fragment (`access_token`, the implicit flow the client currently
uses) and a query `code` (PKCE), so pinning `flowType` later cannot silently break sign-in.

**Onboarding is a gate, not a suggestion.** `app/_layout.tsx` routes on two facts: an account with no
`primary_service` has nowhere to open songs, and one whose `username_claimed` is false is holding the
placeholder that migration 014's trigger generated and cannot be found by anyone. Either sends the
user back into `(onboarding)`. The steps are service, then profile and username, then people, then
notifications; the last two are skippable.

An `on_auth_user_created` trigger creates the `public.users` profile row on signup. Since migration
014 it tolerates a sign-in that carries no username or display name, which is every OAuth and email
code sign-in, so the profile step is what turns the placeholder into a real username.

If a Spotify refresh token has gone bad, the app shows a reconnect prompt on the next login and can route the user straight to Settings to reconnect.
Push-token registration waits for hydrated auth/session state before making Supabase-backed requests so account switching does not race session transport.

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
| `spotify_playlist_id`, `apple_music_playlist_id`, `apple_music_playlist_url`, `youtube_music_playlist_id` | text (nullable) |
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

Apple Music developer tokens are generated server-side by `supabase/functions/apple-music-auth/`.
Set `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` as Supabase secrets; do not expose the `.p8` key or developer JWT in Expo public env. The current native Apple Music flow calls `apple-music-auth` as an authenticated Supabase Edge Function, so there is no public `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL` browser auth page in use.

---

## Current Limitations

1. **Spotify developer-mode rate limits** — daily quota is low. The Edge Function backs off up to 15s on 429s then throws `spotify_rate_limit_exceeded`. Resolved by requesting a Spotify quota extension.

2. **Track matching is approximate** — uses `cleanTitle()` + `cleanArtistName()` + service-specific heuristics. No ISRC matching or duration filtering yet.

3. **Apple Music requires Apple Developer setup** — MusicKit must be enabled for the app's bundle ID, the provisioning profile must include that capability, and `apple-music-auth` must be deployed with Apple secrets before Apple Music login/conversion works.

4. **YouTube playlist creation is sequential** — no batch API for `playlistItems`; each track is a separate request.

5. **Track IDs not pre-resolved cross-service** — only the sender's service ID is stored at share time. Each recipient's Edge Function independently re-searches.

6. **Followed artists — Spotify only** — YouTube Music and Apple Music have no equivalent API endpoint.
