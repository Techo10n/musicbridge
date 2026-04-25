# Auth System

## MusicBridge Auth (Supabase)

- Provider: **Supabase Auth** — email + password
- Session storage: **AsyncStorage** (survives app restarts)
- Auto token refresh: enabled via `autoRefreshToken: true` in Supabase client config
- `detectSessionInUrl: false` (required for React Native)

`AuthProvider` in `hooks/useAuth.tsx` listens to `supabase.auth.onAuthStateChange` and keeps session in sync. Exposes: `session`, `user`, `signIn`, `signOut`, `signUp`, `setPrimaryService`, `refreshUser`.

Registration is a 2-step flow in `app/(auth)/register.tsx`: credentials first, then primary-service selection. After the user selects a primary service, the app prompts them to connect that same service immediately before routing to Home.
If Spotify had to be disconnected because refresh failed, the app stores a reconnect-required flag and shows a popup on the next login that can route the user to Profile.

---

## Streaming Service OAuth

### Spotify

- Flow: PKCE Authorization Code via `expo-auth-session`
- Scopes: `user-read-private`, `playlist-modify-public`, `playlist-modify-private`, `playlist-read-private`, `user-library-read`, `user-follow-read`
- Redirect URI: `musicbridge://spotify-callback`
- Tokens stored in: `spotify_access_token`, `spotify_refresh_token`, `spotify_token_expiry`
- **Note**: Existing Spotify users must re-auth if they connected before `user-library-read` and `user-follow-read` scopes were added (library feature)

### Apple Music

- Flow: native iOS MusicKit / StoreKit authorization via the local Expo module in `modules/apple-music/`, followed by user-token exchange with a server-signed developer token
- Token stored in: `apple_music_user_token`
- No expiry/refresh mechanism — Apple Music user tokens don't expire like OAuth tokens
- Requires server-signed Developer JWT from `apple-music-auth`; Apple private key is stored in Supabase secrets, not Expo public env.
- `apple-music-auth` is an authenticated Supabase Edge Function in the current native flow: keep JWT verification enabled, accept POST only, validate the Supabase user, and strictly validate the request body before returning `token` + `expiresAt`.
- Requires MusicKit enabled on the Apple Developer App ID and `apple-music-auth` deployed with Apple secrets.

### YouTube Music

- Flow: PKCE Authorization Code via `expo-auth-session` with Google OAuth 2.0
- Scopes: `https://www.googleapis.com/auth/youtube`
- Redirect URI: reverse-DNS from Google Client ID (e.g. `com.googleusercontent.apps.<id>:/oauth2redirect/google`)
- Tokens stored in: `youtube_access_token`, `youtube_refresh_token`, `youtube_token_expiry`

---

## Token Refresh Logic

For Spotify and YouTube, token refresh happens automatically in `getSpotifyAccessToken()` / `getYouTubeAccessToken()`:

1. Fetch stored token + expiry from Supabase
2. If expires within 60 seconds → call token endpoint with refresh token
3. Store new tokens back to Supabase

If Spotify refresh fails, the app clears the stored Spotify tokens, marks Spotify as needing reconnection, and shows a reconnect prompt on the next login so it does not keep retrying a bad refresh token on every request.

Apple Music has no refresh mechanism implemented.

---

## Related Pages

- [[database]] — where tokens are stored
- [[integrations/spotify]] · [[integrations/youtube-music]] — OAuth details per service
- [[architecture]] — how AuthProvider fits into the app
