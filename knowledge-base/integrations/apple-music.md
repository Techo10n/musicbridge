# Apple Music Integration

**File**: `lib/appleMusic.ts`  
**Status**: DEFERRED — code exists but non-functional without credentials

**Why deferred**: Requires $99/year Apple Developer membership to generate the Developer Token JWT. Will revisit after the app gains traction.

The `convert-playlist` Edge Function explicitly rejects Apple Music users with an explanatory error.

---

## When Re-enabling

- Need: Team ID, Key ID, `.p8` private key → generate a Developer Token JWT (valid up to 6 months)
- Auth flow: open hosted MusicKit JS page in `expo-web-browser` → user authorizes → redirects to `musicbridge://apple-music-callback?token=<userToken>`
- All API requests need two headers: `Authorization: Bearer <DEVELOPER_TOKEN>` + `Music-User-Token: <userToken>`
- Artwork URLs contain `{w}` and `{h}` placeholders — use `resolveArtworkUrl(url, size)` to fill them

See `SETUP.md` for full credential setup steps.

---

## Related Pages

[[auth]] · [[playlist-conversion]]
