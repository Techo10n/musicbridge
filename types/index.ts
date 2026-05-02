export type MusicService = 'spotify' | 'apple_music' | 'youtube_music';

export type SharedItemType = 'song' | 'playlist';

// A track within a playlist (stored as JSONB in Supabase)
export interface Track {
  title: string;
  artist: string;
  spotify_id: string | null;
  apple_music_id: string | null;
  youtube_music_id: string | null;
}

// ─── Favorite song stored on profile ─────────────────────────────────────────

export interface FavoriteSong {
  title: string;
  artist: string;
  service: MusicService;
  service_id: string;
  cover_url: string;
}

// ─── User profile — extends Supabase auth ─────────────────────────────────────

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  favorite_song: FavoriteSong | null;
  primary_service: MusicService | null;
  created_at: string;
  // Music service tokens (sensitive — only accessible server-side or with RLS)
  spotify_access_token?: string | null;
  spotify_refresh_token?: string | null;
  spotify_token_expiry?: string | null;
  apple_music_user_token?: string | null;
  youtube_access_token?: string | null;
  youtube_refresh_token?: string | null;
  youtube_token_expiry?: string | null;
}

// ─── Follow system ────────────────────────────────────────────────────────────

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
  // Joined relations (present when selected with join)
  follower?: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url'>;
  following?: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url'>;
}

export interface SharedItem {
  id: string;
  sender_id: string;
  recipient_id: string;
  type: SharedItemType;
  title: string;
  artist: string | null;
  cover_image_url: string;
  // Per-service track IDs (songs)
  spotify_id: string | null;
  apple_music_id: string | null;
  youtube_music_id: string | null;
  // Per-service playlist IDs (playlists)
  spotify_playlist_id: string | null;
  apple_music_playlist_id: string | null;
  apple_music_playlist_url?: string | null;
  youtube_music_playlist_id: string | null;
  // Playlist track list
  tracks: Track[] | null;
  message: string | null;
  opened: boolean;
  conversion_status: 'idle' | 'processing' | 'done' | 'failed';
  tracks_processed: number;
  created_at: string;
  // Joined sender profile
  sender?: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url' | 'primary_service'>;
}

// ─── Library types ────────────────────────────────────────────────────────────

export interface LibraryPlaylist {
  id: string;
  name: string;
  coverUrl: string;
  trackCount: number;
  service: MusicService;
}

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  service: MusicService;
}

export interface LibraryArtist {
  id: string;
  name: string;
  imageUrl: string;
}

// ─── Profile stats types ──────────────────────────────────────────────────────

export interface TopTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  popularity: number;
  service: MusicService;
}

export interface TopArtist {
  id: string;
  name: string;
  imageUrl: string;
  genres: string[];
  service: MusicService;
}

export interface RecentTrack {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  playedAt: string;
  service: MusicService;
}

export interface WrappedStats {
  topGenre: string | null;
  topTrackTitle: string | null;
  topTrackArtist: string | null;
  savedCount: number;
  playlistCount: number;
}

// ─── Spotify API shapes ───────────────────────────────────────────────────────

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; width: number; height: number }>;
  };
  uri: string;
  popularity?: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images: Array<{ url: string }>;
  genres: string[];
  popularity: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images: Array<{ url: string }>;
  tracks: {
    total: number;
    items: Array<{ track: SpotifyTrack }>;
  };
}

// ─── Apple Music API shapes ───────────────────────────────────────────────────

export interface AppleMusicTrack {
  id: string;
  attributes: {
    name: string;
    artistName: string;
    albumName: string;
    lastPlayedDate?: string;
    playedDate?: string;
    artwork: {
      url: string; // contains {w} and {h} placeholders
      width: number;
      height: number;
    };
    url: string;
  };
}

export interface AppleMusicPlaylist {
  id: string;
  attributes: {
    name: string;
    artwork?: { url: string };
    url: string;
  };
  relationships?: {
    tracks: { data: AppleMusicTrack[] };
  };
}

// ─── YouTube / YouTube Music API shapes ──────────────────────────────────────

export interface YouTubeTrack {
  id: { videoId: string };
  snippet: {
    title: string;
    channelId?: string;
    channelTitle: string;
    description?: string;
    thumbnails: {
      default: { url: string };
      medium: { url: string };
      high: { url: string };
    };
  };
}
