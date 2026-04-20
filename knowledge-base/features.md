# Features

## Built and Working

### Screens
- **home** — feed of received shared items; pull-to-refresh; song tap → deep link; playlist tap → PlaylistModal
- **friends** — friends/pending tabs, username search, send/accept/decline requests, share button
- **library** — playlists (tap to open detail), saved songs/liked videos (share per song), followed artists (Spotify only, horizontal scroll)
- **profile** — connect/disconnect each service, set primary service, sign out
- **login / register** — email+password; 2-step registration (credentials → primary service)

### Components
- `SongCard` / `PlaylistCard` — unread state (bold + left border)
- `PlaylistModal` — track list + "Add to [service]" conversion
- `ShareModal` — search primary service, pick friend, send
- `LibraryPlaylistDetailModal` — per-track share (paper-plane icon) + "Share Playlist with Friend" footer
- `FriendPickerModal` — reusable, resolves friend from `Friendship` requester/addressee
- `ServiceBadge` / `MusicServiceButton`

### Library (hooks/useLibrary.ts)
- Fetches playlists, saved tracks, followed artists
- `getPlaylistTracks(playlistId)` — lazy track loading on modal open

### Playlist Conversion
- Client-side by default; also available as Edge Function (`supabase/functions/convert-playlist/`)
- Progress tracked via `conversion_status` + `tracks_processed` on `shared_items`

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
- Username search with inline follow/unfollow

### Follows system
- `follows` table: `follower_id → following_id` (directed, no status enum)
- `hooks/useFollows.ts` — replaces `useFriends.ts`; provides following, followers, followUser, unfollowUser, isFollowing, getFollowCounts, searchUsers
- `FriendPickerModal` updated: shows people you follow (not mutual friends)
- `FriendListItem` updated: follow/unfollow button, share button for following list

### Push Notifications
- `lib/notifications.ts` — `registerForPushNotifications`, `unregisterPushToken`, `sendPushNotification`
- `hooks/useNotifications.ts` — registers on login, navigates to home on `new_share` tap, to friends on `new_follower` tap
- `supabase/functions/send-notification/index.ts` — verifies JWT, reads tokens from `push_tokens` table, POSTs to Expo Push API
- `supabase/migrations/005_push_tokens.sql` — `push_tokens` table with unique `(user_id, token)` constraint, RLS owner-only
- Fires on: new share (from `handleShareToFriend`), new follow (from `useFollows.followUser`)

### Instagram Reel Import
- `lib/reelParser.ts` — `parseReelUrl`, `isReelUrl`; `ReelPlatform` type supports instagram + tiktok patterns
- `hooks/useClipboardReel.ts` — clipboard poll on mount + foreground; `seenUrls` ref prevents re-surfacing dismissed URLs
- `components/ReelImportBanner.tsx` — slim top banner with platform icon, "Find Song" button, dismiss
- `components/ReelImportModal.tsx` — analyzing → found → sharing/failed; first edge pass for metadata/audio, then client-side multi-frame extraction via `expo-video-thumbnails`, then vision-only OCR pass; song taps reuse the direct per-service track-opening flow
- `supabase/functions/parse-reel/index.ts` — Instagram GraphQL scrape + strict caption/comment parsing + AudD enterprise fingerprinting (`skip_first_seconds`) + optional OCR over client-supplied frames

## Not Yet Built (from IDEAS.md)

- Collaborative cross-platform playlists (create in app, accessible on each user's own service)
- Real-time "what friends are listening to"
- TikTok reel import (URL patterns already defined in reelParser.ts; edge function needs TikTok routing)

See [[roadmap]] for phased plan.

---

## Related Pages

[[architecture]] · [[playlist-conversion]] · [[roadmap]]
