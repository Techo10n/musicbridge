export type MusicService = 'spotify' | 'apple_music' | 'youtube_music';

export type SharedItemType = 'song' | 'playlist';

// A track within a playlist (stored as JSONB in Supabase)
export interface Track {
  title: string;
  artist: string;
  spotify_id: string | null;
  apple_music_id: string | null;
  youtube_music_id: string | null;
  /**
   * International Standard Recording Code — a globally unique id for this exact
   * recording. Spotify and Apple Music both expose it and both allow looking a
   * track up by it, so when it is present a conversion between those two is an
   * exact identity lookup rather than a fuzzy title/artist search.
   *
   * Captured at share time, because the recipient only holds a token for their
   * own service and cannot query the sender's to obtain it. Optional: older
   * shares predate this field, and YouTube exposes no ISRC at all.
   */
  isrc?: string | null;
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
  // Playlist track list. Omitted by list queries — selecting it pulled every
  // track blob in the inbox — so it is only present once a detail view loads it.
  // Use `tracks_count` for counts; it is a generated column and always present.
  tracks?: Track[] | null;
  tracks_count: number | null;
  message: string | null;
  opened: boolean;
  conversion_status: 'idle' | 'processing' | 'done' | 'failed';
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
  /** ISRC when the source service reports one. See Track.isrc. */
  isrc?: string | null;
  // YouTube Music only: whether `id` was confirmed to come from an
  // "Artist - Topic" channel — the only channel type YouTube Music renders
  // as a Song. Undefined for other services. A `false`/undefined value means
  // `id` is a plain video id that must not be trusted as a canonical Song id
  // (e.g. for sharing or building a music-mix deep link) — see
  // youtube-music.md "Never add non-Topic videos to YouTube Music".
  ytTopicVerified?: boolean;
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
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  uri: string;
  popularity?: number;
  /** Present on full track objects (playlist items, search results). */
  external_ids?: { isrc?: string };
}

export interface SpotifyArtist {
  id: string;
  name: string;
  images: { url: string }[];
  genres: string[];
  popularity: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  images: { url: string }[];
  tracks: {
    total: number;
    items: { track: SpotifyTrack }[];
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
    /** Present on catalog resources; library resources do not carry it. */
    isrc?: string;
  };
  /**
   * Populated when a library resource is requested with `include=catalog`.
   * Library songs expose no ISRC of their own, so the catalog equivalent is
   * the only way to obtain one for an Apple Music -> Spotify conversion.
   */
  relationships?: {
    catalog?: { data?: { attributes?: { isrc?: string } }[] };
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
