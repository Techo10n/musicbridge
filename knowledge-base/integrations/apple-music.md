# Apple Music Integration

**File**: `lib/appleMusic.ts`  
**Status**: Enabled after Apple Developer + Supabase secret setup

Apple Music auth now runs natively on iOS through the local Expo module in `modules/apple-music/`. Supabase still signs short-lived developer tokens server-side in `supabase/functions/apple-music-auth/`, but the user permission prompt and Music user token exchange happen in native iOS code.

---

## Setup

- Need: Team ID, Key ID, `.p8` private key in Supabase secrets
- Need: MusicKit enabled on the Apple App ID for `com.techolon.musicbridge`
- Need: provisioning profile regenerated after enabling MusicKit
- Deploy: `supabase functions deploy apple-music-auth --no-verify-jwt`
- Native module: `modules/apple-music/index.ts` + `modules/apple-music/ios/AppleMusicModule.swift`
- Podspec: `modules/apple-music/ios/AppleMusicNative.podspec`
- Auth flow: native iOS authorization prompt via MusicKit / StoreKit → fetch server-signed developer token from `apple-music-auth` → exchange for Music user token
- All API requests need two headers: `Authorization: Bearer <DEVELOPER_TOKEN>` + `Music-User-Token: <userToken>`
- Playlist conversion is handled by `supabase/functions/convert-playlist/`
- Successful Apple Music playlist conversion should use a direct Apple Music URL only when Apple exposes one: prefer `attributes.url`, then the library playlist's `catalog` relationship URL when present. If Apple doesn't expose a direct URL for the created library playlist, fall back to opening the user's Apple Music Library and tell the user the playlist may take a moment to appear. Do not guess a `music.apple.com/library/playlist/{id}` URL from the raw library playlist ID
- Artwork URLs contain `{w}` and `{h}` placeholders — use `resolveArtworkUrl(url, size)` to fill them
- Storefront is resolved natively via `requestStorefrontCountryCode()` and cached in AsyncStorage
- Shared-song opens should use storefront-local resolution by title/artist first, then fall back to a raw Apple Music ID
- Current Apple Music open behavior: opens to the album page with the target song selected, not a standalone song detail screen

See `SETUP.md` for full credential setup steps.

---

## Related Pages

[[auth]] · [[playlist-conversion]]
