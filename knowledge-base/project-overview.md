# Project Overview

**Author**: Zechariah Frierson | **Status**: MVP in Development (March 2026)

MusicBridge is a cross-platform music sharing mobile app. Users on Spotify, Apple Music, and YouTube Music can share playlists/songs — the app auto-recreates them on the recipient's service.

Long-term vision: social music platform (feeds, following, collaborative playlists, artist tools).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 55, React Native 0.83.2, React 19.2.0 |
| Routing | Expo Router (file-based) |
| Backend | Supabase (auth + PostgreSQL + RLS) |
| Language | TypeScript |

**Install note**: Always use `npm install --legacy-peer-deps` (react-dom peer dep conflict).

---

## Related Pages

[[architecture]] · [[features]] · [[roadmap]]  
[[integrations/spotify]] · [[integrations/apple-music]] · [[integrations/youtube-music]]
