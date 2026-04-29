import { useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { LibraryArtist, LibraryPlaylist, LibraryTrack, MusicService } from '../types';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';

export function useLibrary() {
  const { user } = useAuth();
  const userId = user?.id;
  const primaryService = user?.primary_service;
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [savedTracks, setSavedTracks] = useState<LibraryTrack[]>([]);
  const [followedArtists, setFollowedArtists] = useState<LibraryArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    if (!userId || !primaryService) return;
    setLoading(true);
    setError(null);

    try {
      const service = primaryService as MusicService;

      switch (service) {
        case 'spotify': {
          const [p, count, a] = await Promise.all([
            Spotify.getUserPlaylists(userId),
            Spotify.getSavedTracksCount(userId),
            Spotify.getFollowedArtists(userId),
          ]);
          const likedSongs: LibraryPlaylist = {
            id: '__liked_songs__',
            name: 'Liked Songs',
            coverUrl: '',
            trackCount: count,
            service: 'spotify',
          };
          setPlaylists([likedSongs, ...p]);
          setSavedTracks([]);
          setFollowedArtists(a);
          break;
        }
        case 'apple_music': {
          const [p, t] = await Promise.all([
            AppleMusic.getUserPlaylists(userId),
            AppleMusic.getSavedSongs(userId),
          ]);
          setPlaylists(p);
          setSavedTracks(t);
          setFollowedArtists([]);
          break;
        }
        case 'youtube_music': {
          const [p, channels] = await Promise.all([
            YouTubeMusic.getUserPlaylists(userId),
            YouTubeMusic.getSubscribedChannels(userId, 50),
          ]);
          const likedMusic: LibraryPlaylist = {
            id: '__liked_music__',
            name: 'Liked Music',
            coverUrl: '',
            trackCount: 0,
            service: 'youtube_music' as MusicService,
          };
          setPlaylists([likedMusic, ...p]);
          setSavedTracks([]);
          const artists: LibraryArtist[] = channels.map((ch) => ({
            id: ch.id,
            name: ch.name,
            imageUrl: ch.imageUrl,
          }));
          setFollowedArtists(artists);
          break;
        }
      }
    } catch (err) {
      setError('Failed to load library');
      console.error('[useLibrary] error:', err);
    } finally {
      setLoading(false);
    }
  }, [primaryService, userId]);

  const getPlaylistTracks = useCallback(
    async (playlistId: string, maxTracks?: number): Promise<LibraryTrack[]> => {
      if (!userId || !primaryService) return [];
      const service = primaryService as MusicService;

      switch (service) {
        case 'spotify':
          if (playlistId === '__liked_songs__') {
            const tracks: LibraryTrack[] = [];
            await Spotify.streamSavedTracks(
              userId,
              (page) => tracks.push(...page.slice(0, Math.max(0, (maxTracks ?? Infinity) - tracks.length))),
              () => maxTracks !== undefined && tracks.length >= maxTracks,
            );
            return tracks;
          }
          return Spotify.getPlaylistTracks(userId, playlistId, maxTracks);
        case 'apple_music':
          return AppleMusic.getPlaylistTracks(userId, playlistId, maxTracks);
        case 'youtube_music':
          return YouTubeMusic.getPlaylistTracks(userId, playlistId, maxTracks);
        default:
          return [];
      }
    },
    [primaryService, userId],
  );

  return {
    playlists,
    savedTracks,
    followedArtists,
    loading,
    error,
    fetchLibrary,
    getPlaylistTracks,
  };
}
