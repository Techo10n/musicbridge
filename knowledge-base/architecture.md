# Architecture

## Core Philosophy

No custom backend server. All logic runs on the client. Supabase handles auth, DB, and RLS. Streaming API calls go directly from the device using stored OAuth tokens.

---

## Key Decisions

- **PKCE OAuth on-device**: Spotify + Google via `expo-auth-session`; Apple Music via `expo-web-browser` opening a hosted MusicKit JS page
- **Tokens in Supabase**: stored in `public.users`, RLS-protected (owner-only access)
- **Playlist conversion is client-side**: recipient's device does all track searching and playlist creation
- **Edge Function available**: `supabase/functions/convert-playlist/` for server-side conversion with progress tracking

---

## Request Flow

```
Screen → Hook → lib/supabase.ts or lib/[service].ts → API → React state
```

---

## Design Tokens

| | Value |
|---|---|
| Background | `#0f0f0f` |
| Card | `#1a1a1a` |
| Border | `#2a2a2a` |
| Text | `#ffffff` / `#888888` |
| Spotify | `#1DB954` |
| Apple Music | `#fc3c44` |
| YouTube Music | `#FF0000` |

---

## Related Pages

[[database]] · [[auth]] · [[file-structure]] · [[playlist-conversion]]
