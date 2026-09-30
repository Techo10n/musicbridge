# MusicBridge — Setup & Implementation Guide

## What Was Built

### Foundation
- **`types/index.ts`** — Complete TypeScript types for `User`, `Follow`, `SharedItem`, `Track`, `MusicService`, and all three service-specific track shapes (`SpotifyTrack`, `AppleMusicTrack`, `YouTubeTrack`)
- **`lib/supabase.ts`** — Supabase client with `AsyncStorage` session persistence
- **`supabase/migrations/001_initial.sql`** — Full schema with enums, tables, RLS policies, and indexes

### Auth System
- **`hooks/useAuth.ts`** — `AuthProvider` React context + `useAuth` hook exposing `session`, `user`, `signIn`, `signOut`, `signUp`, `setPrimaryService`, `refreshUser`
- **`app/_layout.tsx`** — Auth-aware root layout; redirects to login if unauthenticated, to home if authenticated
- **`app/(auth)/login.tsx`** — Email/password login with validation and error handling
- **`app/(auth)/register.tsx`** — Two-step registration: credentials → primary streaming service selection

### Music Service Integrations
- **`lib/spotify.ts`** — PKCE OAuth, token refresh, track search, playlist creation, deep links
- **`lib/appleMusic.ts`** — MusicKit JS web auth, track search, playlist creation, deep links *(see Apple setup notes below)*
- **`lib/youtubeMusic.ts`** — Google OAuth PKCE, token refresh, YouTube Data API search, playlist creation

### Data Hooks
- **`hooks/useSharedItems.ts`** — Fetches received items newest-first, pull-to-refresh, `markAsOpened` with optimistic updates
- **`hooks/useFollows.ts`** — Following/followers lists, user search, follow/unfollow, mutual-follow detection for sharing

### Components
- **`ServiceBadge`** — Colored dot badge (S/A/Y) for each service
- **`MusicServiceButton`** — Connect/disconnect button with service branding + Primary indicator
- **`FriendListItem`** — User row with Follow/Unfollow controls and Share button for mutual follows
- **`SongCard`** — Cover art, title, artist, sender, timestamp, message; unread state (bold + left border)
- **`PlaylistCard`** — Like SongCard but with track count overlay on cover art
- **`PlaylistModal`** — Scrollable track list + "Add to [Primary Service]" button
- **`ShareModal`** — Search your primary service, see results, share with a mutual follow (resolves IDs across all services)

### Screens
- **`home.tsx`** — Feed with pull-to-refresh; song tap → service deep link; playlist tap → PlaylistModal
- **`friends.tsx`** — People tab (Following/Followers), username search, follow/unfollow, share button opens ShareModal
- **`profile.tsx`** — Avatar initials, connect/disconnect each service, set primary, sign out

---

## API Credentials You Need

### 1. Supabase (required — free tier works)

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the **SQL Editor**, paste and run the full contents of `supabase/migrations/001_initial.sql`
3. Enable **Email** auth: Authentication → Providers → Email → Enable
4. Copy your credentials from **Settings → API**:
   - `EXPO_PUBLIC_SUPABASE_URL` = Project URL
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` = anon / public key
5. **Authentication → URL Configuration**
   - **Site URL** — must not be left as the default `http://localhost:3000`. It is where every
     link in every auth email lands, so the default silently breaks all of them.
   - **Redirect URLs** — add `museaic://**`, which the Google sign-in flow returns through.
6. **Authentication → Email Templates** — strip the link out of **Confirm signup** *and*
   **Magic Link**. See below for why, and what to paste.

#### Email templates must contain the code, not a link

Sign-in is a six-digit code: `signInWithOtp` sends the mail, the user types the number, and
`verifyOtp` exchanges it. The stock templates instead offer `{{ .ConfirmationURL }}`, a magic link,
and **that link cannot ever work in this app**:

- `lib/supabase.ts` sets `detectSessionInUrl: false`, which React Native requires.
- Nothing listens for an inbound `museaic://callback`. The Google flow captures its redirect inside
  `WebBrowser.openAuthSessionAsync`, which only sees it during that call.

So a magic link is a dead control shipped inside an email. Delete it rather than repairing it.
Paste this as the body of **both** templates — Supabase sends *Confirm signup* to an address it has
not seen before and *Magic Link* to one it has, so fixing only one leaves every new signup broken:

```html
<h2>Your Museaic code</h2>
<p>Enter this code in the app to sign in:</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:600">{{ .Token }}</p>
<p>It expires in one hour. If you didn't ask for it, you can ignore this email.</p>
```

The **Reset Password** template still uses a link, because `resetPasswordForEmail` in
`app/(tabs)/settings.tsx` has no code-based equivalent. That link needs a Site URL pointing at a real
web page to work at all — see [[gotchas]] in the vault.

---

### 2. Spotify Developer Account

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App** — fill in name and description
3. Under **Redirect URIs**, add:
   - `musicbridge://spotify-callback`
   - `exp://localhost:8081` *(for Expo Go during development)*
4. Copy the **Client ID**:
   - `EXPO_PUBLIC_SPOTIFY_CLIENT_ID` = Client ID

> No client secret is needed — the app uses the PKCE flow which doesn't require one on the client side.

---

### 3. Google Cloud Console (YouTube Music)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project
2. Go to **APIs & Services → Library** and enable **YouTube Data API v3**
3. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
   - For iOS: choose **iOS**, set bundle ID to `com.techolon.musicbridge`
   - For Android: choose **Android**, set package name to `com.techolon.musicbridge`
4. Add redirect URI: `musicbridge://youtube-callback`
5. Copy the **Client ID**:
   - `EXPO_PUBLIC_GOOGLE_CLIENT_ID` = Client ID

> You'll likely need one credential per platform (iOS and Android have separate client IDs from Google). You can pick whichever matches your dev target for now.

---

### 4. Apple Music (most complex — requires paid Apple Developer account)

Apple Music auth is different from the others. It uses **MusicKit**, not standard OAuth.

#### Step 1 — Apple Developer Setup
1. Go to [developer.apple.com](https://developer.apple.com) and sign in ($99/year membership required)
2. Go to **Certificates, Identifiers & Profiles → Identifiers**
3. Find or create your App ID (`com.techolon.musicbridge`) and enable **MusicKit** capability
4. Go to **Keys → Create a Key**, enable **Media Services (MusicKit)**, and download the `.p8` private key file
5. Note your **Team ID** (top right of your developer account):
   - `EXPO_PUBLIC_APPLE_TEAM_ID` = Team ID

#### Step 2 — Deploy Apple Music Auth

Apple Music API calls require a signed **Developer Token** JWT. MusicBridge generates this server-side in the `apple-music-auth` Supabase Edge Function so your `.p8` private key is never embedded in the app.

Set Supabase secrets:

```bash
supabase secrets set APPLE_TEAM_ID=<your-team-id>
supabase secrets set APPLE_KEY_ID=<your-key-id>
supabase secrets set APPLE_PRIVATE_KEY="$(cat AuthKey_<your-key-id>.p8)"
```

Deploy the token-signing function with default JWT verification enabled. The current Apple Music flow is native iOS auth, so `apple-music-auth` is invoked by the authenticated app via `supabase.functions.invoke(...)` and does not need a public browser endpoint.

```bash
supabase functions deploy apple-music-auth
supabase secrets set SPOTIFY_CLIENT_ID=<spotify-client-id>
supabase secrets set GOOGLE_CLIENT_ID=<google-client-id>
supabase functions deploy convert-playlist
```

Security checklist for `apple-music-auth`:
- Keep Supabase JWT verification enabled. Do not use `--no-verify-jwt` for the current native flow.
- Accept authenticated `POST` requests only, and validate the Supabase user inside the function before returning a token.
- Validate the request body strictly. MusicBridge only accepts `{ "action": "token" }`.
- Return only the short-lived developer token payload (`token`, `expiresAt`). Never return Apple private key material or other secrets.
- Keep token TTL short and log/monitor unusual request volume.

If you later reintroduce a separate public browser-based MusicKit JS page, treat it as a new public endpoint and add compensating controls before considering `--no-verify-jwt`: rate limiting, strict origin/referrer allowlists, CSRF/nonces, strict input validation, and minimal responses with no sensitive data.

---

### 5. Google sign-in (native)

The Google button uses the iOS sign-in sheet, not a browser. The web flow was replaced because
Google's consent screen named the Supabase project domain — "Sign in to `<ref>.supabase.co`" — which
is a string the user has no way to recognise.

1. **Supabase → Authentication → Providers → Google** — enable it, and paste in the id and secret of
   a **Web application** OAuth client from Google Cloud. This client is never opened; it exists so
   Supabase has an audience to verify the native token against.
2. **`.env.local`** — set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` to that same web client id.
3. **`EXPO_PUBLIC_GOOGLE_CLIENT_ID`** is the iOS client, already set for YouTube Music. Native sign-in
   reuses it deliberately: its reverse is the `com.googleusercontent.apps.*` URL scheme in
   `ios/musicbridge/Info.plist`, and a second copy under its own variable could drift from the plist.
4. Rebuild — `npx expo run:ios`. The module is native, so a JS reload will not pick it up.

The button stays hidden until both ids are present, so a half-configured build shows no Google
option rather than one that throws when tapped.

> This repo commits `ios/`, so the package's Expo config plugin never runs. The URL scheme was
> already present from YouTube Music, and `pod install` has been run. A future native dependency
> will need the same hand-mirroring — see the vault's `gotchas`.

---

## TestFlight Build

1. In Apple Developer, create or confirm the explicit App ID `com.techolon.musicbridge` and enable MusicKit.
2. In App Store Connect, create the iOS app record for `com.techolon.musicbridge`.
3. Add the Expo public environment variables to EAS for production builds.
4. Build and submit:

```bash
npx eas login
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

After Apple processes the build, open App Store Connect → your app → TestFlight, create an internal testing group, and add yourself or selected App Store Connect users.

---

## Running the App

```bash
# 1. Copy env template and fill in your credentials
cp .env.example .env.local

# 2. Run the SQL migration
# Open Supabase → SQL Editor → paste contents of supabase/migrations/001_initial.sql → Run

# 3. Start the dev server
npm run ios       # iOS simulator
npm run android   # Android emulator / device
npm run start     # Expo Go (scan QR code)
```

---

## File Structure Reference

```
musicbridge/
├── app/
│   ├── _layout.tsx              Root layout — auth redirect logic
│   ├── index.tsx                Loading spinner (auth resolves here)
│   ├── (auth)/
│   │   ├── login.tsx            Email + password login
│   │   └── register.tsx         2-step: credentials → service selection
│   └── (tabs)/
│       ├── _layout.tsx          Tab bar with Ionicons
│       ├── home.tsx             Feed of received shared items
│       ├── friends.tsx          People tab + search + following/followers
│       └── profile.tsx          Profile + service connections + sign out
├── lib/
│   ├── supabase.ts              Supabase client
│   ├── spotify.ts               Spotify PKCE OAuth + API
│   ├── appleMusic.ts            Apple Music MusicKit auth + API
│   └── youtubeMusic.ts          Google OAuth + YouTube Data API
├── hooks/
│   ├── useAuth.ts               Auth context provider + hook
│   ├── useSharedItems.ts        Received items data hook
│   └── useFollows.ts            Follow graph + search data hook
├── components/
│   ├── SongCard.tsx             Shared song card
│   ├── PlaylistCard.tsx         Shared playlist card
│   ├── PlaylistModal.tsx        Playlist detail + "Add to service"
│   ├── ShareModal.tsx           Search + share flow
│   ├── FriendListItem.tsx       Friend row component
│   ├── ServiceBadge.tsx         Colored service indicator dot
│   └── MusicServiceButton.tsx   Connect/disconnect service button
├── types/
│   └── index.ts                 All TypeScript types
├── supabase/
│   └── migrations/
│       └── 001_initial.sql      Database schema + RLS policies
└── .env.example                 All required environment variables
```

---

## Design Tokens

| Token | Value |
|---|---|
| Background | `#0f0f0f` |
| Card background | `#1a1a1a` |
| Border / divider | `#2a2a2a` |
| Primary text | `#ffffff` |
| Secondary text | `#888888` |
| Muted text | `#555555` |
| Spotify green | `#1DB954` |
| Apple Music pink | `#fc3c44` |
| YouTube Music red | `#FF0000` |
| Error red | `#ff4444` |
| Border radius | `12px` |
