# Features

## Built and Working

### Screens
- **home** — feed of received shared items; pull-to-refresh; realtime refresh on new/updated shares; working inbox/following/mixes filters; top-bar search modal; song tap → deep link; playlist tap → PlaylistModal
- **friends** — People tab with auto-populating username search, follow/unfollow, suggested follows, and taste match percentages based on shared-item/favorite-song overlap
- **library** — playlists (tap to open detail), `All Songs` and `Reel Songs` pseudo-playlist rows, saved songs/liked videos, followed artists, Supabase-backed saved reel history, clickable filters with empty states, sort controls, deduped playlist-track-backed search, and placeholder artist-page alerts
- **notifications** — hidden route opened from top-bar bells; merges recent shares and recent followers into one inbox
- **profile** — avatar picker/upload, connect/disconnect each service, set primary service, quick-connect missing services, system share sheet for profile links, favorite-song search across connected services, sign out
- **settings** — keyboard-aware profile editing sheet plus avatar upload, privacy/notification/account controls, real password-reset email trigger, and placeholder legal/rating rows
- **login / register** — email+password; 2-step registration (credentials → primary service) with immediate connect prompt for the selected default service before entering Home
- **login** — shows a Spotify reconnect prompt when a stored Spotify refresh token was invalidated and the user needs to reconnect from Profile

### Components
- `SongCard` / `PlaylistCard` — unread state (bold + left border)
- `PlaylistModal` — track list + "Add to [service]" conversion; preserves live progress/success during the current conversion, and if the playlist was already converted for the recipient when reopened later, shows `Already In Library` instead of another add action. For Apple Music, opens a catalog playlist URL when Apple exposes one, otherwise falls back to the Apple Music Library and explains that the new playlist may take a moment to appear
- `ShareModal` — search primary service, pick friend, send; opens with a fade transition to avoid visible sheet/overlay slide-in
- `LibraryPlaylistDetailModal` — per-track share (paper-plane icon) + "Share Playlist with Friend" footer; refreshes mutual follows when share opens
- `FriendPickerModal` — reusable mutual-follow picker; refreshes follows whenever opened
- `StoryViewer` — story playback, reactions, open-in-service, and placeholder alerts for more/reply actions
- `ServiceBadge` / `MusicServiceButton`

### Library (hooks/useLibrary.ts)
- Fetches playlists, saved tracks, followed artists
- `getPlaylistTracks(playlistId)` — lazy track loading on modal open

### Playlist Conversion
- Client-side by default; also available as Edge Function (`supabase/functions/convert-playlist/`)
- Progress tracked via `conversion_status` + `tracks_processed` on `shared_items`
- `useSharedItems` now refreshes on both `INSERT` and `UPDATE` so conversion completion state is reflected without manual refresh

---

### Profile tab (revamped)
- Instagram-style layout: avatar (tappable → image picker), name, @username, bio (tap to edit)
- Followers / Following / Shared count row
- Favorite song (tappable to set via search)
- Taste tags — auto-generated genre labels (Spotify only; derived from top artists)
- Wrapped-style stats card: top track, top genre, saved count, playlist count
- Top Artists horizontal scroll (Spotify: top artists API; YouTube: subscribed channels)
- Top Songs horizontal scroll (Spotify: top tracks API)
- Pinned Playlists — up to 3, stored in AsyncStorage; picker pulls from Library
- Listening History — Spotify-only, opt-in toggle, AsyncStorage preference

### People tab (replaces Friends)
- Directed follow model (Instagram-style), no approval step
- Following / Followers tabs with follow/unfollow buttons
- Username search auto-populates while typing
- Suggested follows exclude accounts already followed
- Match % is derived from overlap in shared artists/titles plus favorite-song and primary-service hints, not random values

### Follows system
- `follows` table: `follower_id → following_id` (directed, no status enum)
- `hooks/useFollows.ts` — replaces `useFriends.ts`; provides following, followers, followUser, unfollowUser, isFollowing, getFollowCounts, searchUsers
- `FriendPickerModal` updated: shows people you follow (not mutual friends)
- `FriendListItem` updated: follow/unfollow button, share button for following list

### Push Notifications
- `lib/notifications.ts` — `registerForPushNotifications`, `unregisterPushToken`, `sendPushNotification`
- `hooks/useNotifications.ts` — registers on login, navigates to home on `new_share` tap, to friends on `new_follower` tap
- `app/(tabs)/notifications.tsx` — in-app notifications inbox for recent shares and follow activity
- `supabase/functions/send-notification/index.ts` — verifies JWT, reads tokens from `push_tokens` table, POSTs to Expo Push API
- `supabase/migrations/005_push_tokens.sql` — `push_tokens` table with unique `(user_id, token)` constraint, RLS owner-only
- Fires on: new share (from `handleShareToFriend`), new follow (from `useFollows.followUser`)

### Instagram Reel Import
- `lib/reelParser.ts` — `parseReelUrl`, `isReelUrl`; `ReelPlatform` type supports instagram + tiktok patterns
- `hooks/useClipboardReel.ts` — clipboard poll after auth hydration + on foreground; `seenUrls` ref prevents re-surfacing dismissed URLs and is reset when the signed-in user changes so account switching does not suppress reel prompts
- `components/ReelImportBanner.tsx` — slim top banner with platform icon, "Find Song" button, dismiss
- `components/ReelImportModal.tsx` — analyzing → found → sharing/failed; first edge pass for metadata/audio, then client-side multi-frame extraction via `expo-video-thumbnails`, then vision-only OCR pass; best-match previews and song rows reuse the direct per-service track-opening flow and fall back instead of opening a guessed YouTube Music result
- `app/(tabs)/share.tsx` — manual reel-link paste screen opened from the center-tab share menu
- `supabase/functions/parse-reel/index.ts` — Instagram GraphQL scrape + strict caption/comment parsing + AudD enterprise fingerprinting (`skip_first_seconds`) + optional OCR over client-supplied frames

### Placeholder UI Follow-ups
- Story options and replies now show explicit placeholder alerts instead of doing nothing
- User profile notifications/options and Friend Blend now show explicit placeholder alerts
- Library artist rows now show explicit placeholder alerts until artist pages exist
- Settings Block List, Terms, Privacy Policy, and Rate the App rows now show explicit placeholder/empty-state alerts until production destinations exist

## Not Yet Built (from IDEAS.md)

- Collaborative cross-platform playlists (create in app, accessible on each user's own service)
- Real-time "what friends are listening to"
- TikTok reel import (URL patterns already defined in reelParser.ts; edge function needs TikTok routing)

See [[roadmap]] for phased plan.

---

## Related Pages

[[architecture]] · [[playlist-conversion]] · [[roadmap]]
