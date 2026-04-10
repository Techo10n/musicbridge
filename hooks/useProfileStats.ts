import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './useAuth';
import * as Spotify from '../lib/spotify';
import * as YouTube from '../lib/youtubeMusic';
import { TopTrack, TopArtist, RecentTrack, WrappedStats, LibraryPlaylist } from '../types';

const getPinnedKey = (userId: string) => `profile_pinned_playlists_${userId}`;
const getHistoryOptInKey = (userId: string) => `profile_history_opt_in_${userId}`;
const MAX_PINNED = 3;

export interface ProfileStats {
  topTracks: TopTrack[];
  topArtists: TopArtistEntry[];
  recentTracks: RecentTrack[];
  tasteTags: string[];
  wrappedStats: WrappedStats | null;
  pinnedPlaylists: LibraryPlaylist[];
  historyOptIn: boolean;
  loading: boolean;
}

/** Unified artist shape that works for both Spotify and YouTube */
export interface TopArtistEntry {
  id: string;
  name: string;
  imageUrl: string;
  genres?: string[];
}

export function useProfileStats() {
  const { user } = useAuth();

  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [topArtists, setTopArtists] = useState<TopArtistEntry[]>([]);
  const [recentTracks, setRecentTracks] = useState<RecentTrack[]>([]);
  const [tasteTags, setTasteTags] = useState<string[]>([]);
  const [wrappedStats, setWrappedStats] = useState<WrappedStats | null>(null);
  const [pinnedPlaylists, setPinnedPlaylists] = useState<LibraryPlaylist[]>([]);
  const [historyOptIn, setHistoryOptIn] = useState(false);
  const [loading, setLoading] = useState(true);

  const hasFetched = useRef(false);

  // ─── Pinned playlists ────────────────────────────────────────────────────────

  const loadPinned = useCallback(async () => {
    if (!user) return;
    try {
      const raw = await AsyncStorage.getItem(getPinnedKey(user.id));
      if (raw) setPinnedPlaylists(JSON.parse(raw) as LibraryPlaylist[]);
    } catch {}
  }, [user]);

  const pinPlaylist = useCallback(async (playlist: LibraryPlaylist) => {
    const key = getPinnedKey(user?.id ?? 'unknown');
    setPinnedPlaylists((prev) => {
      if (prev.find((p) => p.id === playlist.id)) return prev;
      const next = [...prev, playlist].slice(0, MAX_PINNED);
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [user]);

  const unpinPlaylist = useCallback(async (playlistId: string) => {
    const key = getPinnedKey(user?.id ?? 'unknown');
    setPinnedPlaylists((prev) => {
      const next = prev.filter((p) => p.id !== playlistId);
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [user]);

  // ─── History opt-in ──────────────────────────────────────────────────────────

  const loadHistoryPref = useCallback(async () => {
    if (!user) return;
    try {
      const val = await AsyncStorage.getItem(getHistoryOptInKey(user.id));
      setHistoryOptIn(val === 'true');
    } catch {}
  }, [user]);

  const setHistoryOptInPref = useCallback(async (enabled: boolean) => {
    setHistoryOptIn(enabled);
    try {
      await AsyncStorage.setItem(getHistoryOptInKey(user?.id ?? 'unknown'), enabled ? 'true' : 'false');
    } catch {}
  }, [user]);

  // ─── Taste tags from genres ───────────────────────────────────────────────────

  function deriveTasteTags(artists: TopArtistEntry[]): string[] {
    const genreCounts = new Map<string, number>();
    for (const artist of artists) {
      for (const genre of artist.genres ?? []) {
        // Capitalize and clean up genre strings
        const label = genre
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
        genreCounts.set(label, (genreCounts.get(label) ?? 0) + 1);
      }
    }
    return Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([tag]) => tag);
  }

  // ─── Main fetch ──────────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    hasFetched.current = true;

    const hasSpotify = !!user.spotify_access_token;
    const hasYouTube = !!user.youtube_access_token;

    try {
      if (hasSpotify) {
        // Fetch all Spotify stats in parallel
        const [tracks, artists, recent] = await Promise.all([
          Spotify.getTopTracks(user.id, 5),
          Spotify.getTopArtists(user.id, 5),
          historyOptIn ? Spotify.getRecentlyPlayed(user.id, 20) : Promise.resolve([]),
        ]);

        setTopTracks(tracks);
        setTopArtists(artists);
        setRecentTracks(recent);

        const tags = deriveTasteTags(artists);
        setTasteTags(tags);

        // Wrapped stats
        const topGenre = tags[0] ?? null;
        const savedCount = await Spotify.getSavedTracksCount(user.id);
        const playlists = await Spotify.getUserPlaylists(user.id);
        setWrappedStats({
          topGenre,
          topTrackTitle: tracks[0]?.title ?? null,
          topTrackArtist: tracks[0]?.artist ?? null,
          savedCount,
          playlistCount: playlists.length,
        });
      } else if (hasYouTube) {
        const [channels, analysis] = await Promise.all([
          YouTube.getSubscribedChannels(user.id, 5),
          YouTube.analyzeYouTubeLibrary(user.id),
        ]);

        // Map subscribed channels to TopArtistEntry
        setTopArtists(
          channels.map((c) => ({
            id: c.id,
            name: c.name,
            imageUrl: c.imageUrl,
          })),
        );

        // Map most frequent liked-music artists to TopTrack-like entries
        const derivedTopTracks: TopTrack[] = analysis.topArtists
          .slice(0, 5)
          .map((a, i) => ({
            id: `yt-artist-${i}`,
            title: `Top track by ${a.name}`,
            artist: a.name,
            coverUrl: '',
            popularity: a.count,
            service: 'youtube_music' as const,
          }));
        setTopTracks(derivedTopTracks);

        // Use topTrack from liked music for the "top track" stat
        const topT = analysis.topTrack;
        setWrappedStats({
          topGenre: null,
          topTrackTitle: topT?.title ?? null,
          topTrackArtist: topT?.artist ?? null,
          savedCount: analysis.likedCount,
          playlistCount: analysis.playlistCount,
        });

        setTasteTags([]); // YouTube has no genre data
        setRecentTracks([]); // Not available on YouTube
      }
    } catch (err) {
      console.error('[useProfileStats] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user, historyOptIn]);

  useEffect(() => {
    loadPinned();
    loadHistoryPref();
  }, [loadPinned, loadHistoryPref]);

  useEffect(() => {
    if (user && !hasFetched.current) {
      fetchStats();
    }
  }, [user, fetchStats]);

  // Re-fetch recent tracks when opt-in changes (and we've already fetched once)
  useEffect(() => {
    if (hasFetched.current && user?.spotify_access_token) {
      if (historyOptIn) {
        Spotify.getRecentlyPlayed(user.id, 20).then(setRecentTracks).catch(() => {});
      } else {
        setRecentTracks([]);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOptIn]);

  return {
    topTracks,
    topArtists,
    recentTracks,
    tasteTags,
    wrappedStats,
    pinnedPlaylists,
    historyOptIn,
    loading,
    pinPlaylist,
    unpinPlaylist,
    setHistoryOptIn: setHistoryOptInPref,
    refresh: fetchStats,
  };
}
