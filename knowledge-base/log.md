# Knowledge Base Log

Append-only. Each entry records what changed and why.

---

## 2026-04-07 — Initial population

Created knowledge base from project files, README, SETUP.md, IDEAS.md, CLAUDE.md, and session memory.

**Files created**:
- `index.md` — hub/index
- `project-overview.md` — what MusicBridge is
- `architecture.md` — system design + design tokens
- `file-structure.md` — repo layout
- `database.md` — Supabase schema
- `auth.md` — auth system (Supabase + streaming service OAuth)
- `features.md` — all implemented features + IDEAS backlog
- `playlist-conversion.md` — how cross-platform conversion works
- `roadmap.md` — phased plan + IDEAS.md backlog
- `preferences.md` — Zech's preferences and style
- `mistakes-and-learnings.md` — bugs and lessons from past sessions
- `integrations/spotify.md` — Spotify API functions, rate limits, scopes
- `integrations/apple-music.md` — deferred status + re-enable notes
- `integrations/youtube-music.md` — music filtering, LM vs LL, search heuristic
- `log.md` — this file

## 2026-04-07 — Fix Liked Songs streaming not showing all tracks

**Files changed**: `components/LibraryPlaylistDetailModal.tsx`, `hooks/useLibrary.ts`

- Added `streamingMore` state to `LibraryPlaylistDetailModal`. Shows a footer spinner while pages are still being fetched after the first 50 tracks appear. Previously: spinner disappeared after first page, user could close modal before streaming finished.
- Fixed `useLibrary.getPlaylistTracks` calling non-existent `Spotify.getSavedTracks`. Now wraps `streamSavedTracks` as a synchronous collector.
- Updated `mistakes-and-learnings.md` with this incident.
