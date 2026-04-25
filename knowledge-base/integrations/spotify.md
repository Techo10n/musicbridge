# Spotify Integration

**File**: `lib/spotify.ts` | **Status**: Active

## Functions

| Function | Purpose |
|---|---|
| `connectSpotify` | PKCE OAuth connect |
| `getSpotifyAccessToken` | Auto-refresh (if within 60s of expiry); clears tokens and flags reconnect if refresh fails |
| `searchTrack` | Single-track match for conversion |
| `searchTracks` | Free-form search (up to 10 results) |
| `getSpotifyUserId` | Needed for playlist creation |
| `createPlaylist` | Create + add tracks |
| `getUserPlaylists` | All pages (50/page) |
| `getPlaylistTracks` | All pages (100/page) |
| `getSavedTracks` | All pages (50/page) — streamed |
| `getFollowedArtists` | Library: followed artists |

## Scopes

`user-read-private`, `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`, `user-library-read`, `user-follow-read`

Existing users must re-auth if connected before `user-library-read`/`user-follow-read` were added.
If a stored Spotify refresh token is revoked or invalid, the app clears the saved Spotify tokens and requires the user to reconnect.
The reconnect path is surfaced in UI on the next login via a popup that can route the user to Profile.

## Rate Limits

`searchTrack` retries 3× respecting `Retry-After`. If wait > 15s → throws `spotify_rate_limit_exceeded` (indicates dev quota exhaustion, not just throttling).

## Deep Links

`spotify:track:<id>` / `spotify:playlist:<id>` — HTTPS fallback

---

[[auth]] · [[playlist-conversion]] · [[mistakes-and-learnings]]
