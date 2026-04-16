# File Structure

```
musicbridge/
├── app/                            Expo Router file-based screens
│   ├── _layout.tsx                 Root layout: AuthProvider + SafeAreaProvider + redirect logic
│   ├── index.tsx                   Loading spinner while auth resolves
│   ├── (auth)/
│   │   ├── login.tsx               Email/password login
│   │   └── register.tsx            Multi-step: credentials → primary service selection
│   └── (tabs)/
│       ├── _layout.tsx             Tab bar with Ionicons
│       ├── home.tsx                Feed of received shared items
│       ├── friends.tsx             Friends list + pending requests + user search
│       ├── library.tsx             User's streaming library (playlists, saved songs, artists)
│       └── profile.tsx             Profile + music service connections + sign out
│
├── components/
│   ├── SongCard.tsx                Card for shared songs (cover, title, artist, sender, unread)
│   ├── PlaylistCard.tsx            Like SongCard with track count overlay
│   ├── PlaylistModal.tsx           Scrollable track list + "Add to [service]" button
│   ├── ShareModal.tsx              Search primary service + share with friend
│   ├── FriendListItem.tsx          Friend row: share / accept / decline
│   ├── FriendPickerModal.tsx       Reusable friend picker with optional message
│   ├── LibraryPlaylistDetailModal.tsx  Playlist track list from library; share per-track or whole playlist
│   ├── MusicServiceButton.tsx      Connect/disconnect service button with branding
│   └── ServiceBadge.tsx            Colored dot badge (S / A / Y)
│
├── hooks/
│   ├── useAuth.tsx                 AuthContext provider + hook (session, user, signIn/Out/Up)
│   ├── useFriends.ts               Friends list, pending requests, user search
│   ├── useSharedItems.ts           Received items feed, markAsOpened
│   └── useLibrary.ts               Streaming library: playlists, saved tracks, followed artists
│                                   Exposes getPlaylistTracks(id) for lazy loading
│
├── lib/
│   ├── supabase.ts                 Supabase client (AsyncStorage persistence)
│   ├── spotify.ts                  Spotify PKCE OAuth, token refresh, search, playlist CRUD, library
│   ├── appleMusic.ts               Apple Music MusicKit auth, search, playlist CRUD (deferred)
│   ├── youtubeMusic.ts             Google OAuth, YouTube Data API, search, playlist CRUD, library
│   └── utils.ts                    withTimeout(), cleanArtistName(), cleanTitle()
│
├── types/
│   └── index.ts                    All TypeScript types: User, SharedItem, Track, LibraryPlaylist,
│                                   LibraryTrack, LibraryArtist, SpotifyTrack, AppleMusicTrack, YouTubeTrack
│
├── supabase/
│   ├── functions/
│   │   └── convert-playlist/
│   │       └── index.ts            Edge Function: server-side conversion with progress updates
│   └── migrations/
│       ├── 001_initial.sql         Full schema with RLS policies and indexes
│       └── 003_conversion_progress.sql  Adds conversion_status + tracks_processed to shared_items
│
├── knowledge-base/                 ← you are here
├── CLAUDE.md                       Claude Code instructions (rules for this project)
├── README.md                       Full project documentation
├── SETUP.md                        Setup guide + API credential instructions
├── IDEAS.md                        Feature ideas log
├── .env.example                    Required env var names (no values)
├── app.json                        Expo app configuration
└── package.json                    Dependencies
```

---

## Related Pages

- [[architecture]] — how these pieces connect
- [[database]] — what's in the migrations
- [[features]] — what each screen/hook/component does
