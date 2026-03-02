# MusicBridge — Setup & Implementation Guide

## What Was Built

### Foundation
- **`types/index.ts`** — Complete TypeScript types for `User`, `Friendship`, `SharedItem`, `Track`, `MusicService`, and all three service-specific track shapes (`SpotifyTrack`, `AppleMusicTrack`, `YouTubeTrack`)
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
- **`hooks/useFriends.ts`** — Friends list, pending requests, user search, send/accept/decline requests

### Components
- **`ServiceBadge`** — Colored dot badge (S/A/Y) for each service
- **`MusicServiceButton`** — Connect/disconnect button with service branding + Primary indicator
- **`FriendListItem`** — Friend row with Share button or Accept/Decline for pending requests
- **`SongCard`** — Cover art, title, artist, sender, timestamp, message; unread state (bold + left border)
- **`PlaylistCard`** — Like SongCard but with track count overlay on cover art
- **`PlaylistModal`** — Scrollable track list + "Add to [Primary Service]" button
- **`ShareModal`** — Search your primary service, see results, share with a friend (resolves IDs across all services)

### Screens
- **`home.tsx`** — Feed with pull-to-refresh; song tap → service deep link; playlist tap → PlaylistModal
- **`friends.tsx`** — Friends/Pending tabs, username search, send requests, share button opens ShareModal
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
   - For iOS: choose **iOS**, set bundle ID to `com.musicbridge.app`
   - For Android: choose **Android**, set package name to `com.musicbridge.app`
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
3. Find or create your App ID (`com.musicbridge.app`) and enable **MusicKit** capability
4. Go to **Keys → Create a Key**, enable **Media Services (MusicKit)**, and download the `.p8` private key file
5. Note your **Team ID** (top right of your developer account):
   - `EXPO_PUBLIC_APPLE_TEAM_ID` = Team ID

#### Step 2 — Generate a Developer Token
Apple Music API calls require a signed JWT called a **Developer Token**. You generate this using your `.p8` key.

You can generate one using a simple Node.js script (run this once, tokens last up to 6 months):

```js
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./AuthKey_XXXXXXXXXX.p8');

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  issuer: 'YOUR_TEAM_ID',        // from Apple Developer account
  header: {
    alg: 'ES256',
    kid: 'YOUR_KEY_ID',          // the 10-char ID of the key you created
  },
});

console.log(token);
```

Set the output as:
- `EXPO_PUBLIC_APPLE_DEVELOPER_TOKEN` = the generated JWT

> ⚠️ For production, generate this token server-side so your `.p8` private key is never exposed in the app or in source control.

#### Step 3 — Host a MusicKit Auth Page

The app opens a web page to handle the Apple Music user authorization flow. You need to host this page yourself (Vercel, Netlify, or any static host works).

Create an `index.html` like this:

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"></script>
</head>
<body>
<script>
  document.addEventListener('musickitloaded', async () => {
    await MusicKit.configure({
      developerToken: 'YOUR_DEVELOPER_TOKEN_HERE',
      app: { name: 'MusicBridge', build: '1.0' },
    });
    const music = MusicKit.getInstance();
    const userToken = await music.authorize();
    // Redirect back to the app with the user token
    window.location.href = `musicbridge://apple-music-callback?token=${userToken}`;
  });
</script>
</body>
</html>
```

Set the hosted URL as:
- `EXPO_PUBLIC_APPLE_MUSIC_AUTH_URL` = your hosted page URL (e.g. `https://musicbridge-auth.vercel.app`)

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
│       ├── friends.tsx          Friends list + search + pending requests
│       └── profile.tsx          Profile + service connections + sign out
├── lib/
│   ├── supabase.ts              Supabase client
│   ├── spotify.ts               Spotify PKCE OAuth + API
│   ├── appleMusic.ts            Apple Music MusicKit auth + API
│   └── youtubeMusic.ts          Google OAuth + YouTube Data API
├── hooks/
│   ├── useAuth.ts               Auth context provider + hook
│   ├── useSharedItems.ts        Received items data hook
│   └── useFriends.ts            Friends + search data hook
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
