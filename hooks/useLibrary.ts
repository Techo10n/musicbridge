import { useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { LibraryArtist, LibraryPlaylist, LibraryTrack, MusicService } from '../types';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';

export function useLibrary() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<LibraryPlaylist[]>([]);
  const [savedTracks, setSavedTracks] = useState<LibraryTrack[]>([]);
  const [followedArtists, setFollowedArtists] = useState<LibraryArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLibrary = useCallback(async () => {
    if (!user?.primary_service) return;
    setLoading(true);
    setError(null);

    try {
      const service = user.primary_service as MusicService;

      switch (service) {
        case 'spotify': {
          const [p, count, a] = await Promise.all([
            Spotify.getUserPlaylists(user.id),
            Spotify.getSavedTracksCount(user.id),
            Spotify.getFollowedArtists(user.id),
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
            AppleMusic.getUserPlaylists(user.id),
            AppleMusic.getSavedSongs(user.id),
          ]);
          setPlaylists(p);
          setSavedTracks(t);
          setFollowedArtists([]);
          break;
        }
        case 'youtube_music': {
          const [p, t] = await Promise.all([
            YouTubeMusic.getUserPlaylists(user.id),
            YouTubeMusic.getLikedMusic(user.id),
          ]);
          setPlaylists(p);
          setSavedTracks(t);
          setFollowedArtists([]);
          break;
        }
      }
    } catch (err) {
      setError('Failed to load library');
      console.error('[useLibrary] error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const getPlaylistTracks = useCallback(
    async (playlistId: string): Promise<LibraryTrack[]> => {
      if (!user?.primary_service) return [];
      const service = user.primary_service as MusicService;

      switch (service) {
        case 'spotify':
          if (playlistId === '__liked_songs__') return Spotify.getSavedTracks(user.id);
          return Spotify.getPlaylistTracks(user.id, playlistId);
        case 'apple_music':
          return AppleMusic.getPlaylistTracks(user.id, playlistId);
        case 'youtube_music':
          return YouTubeMusic.getPlaylistTracks(user.id, playlistId);
        default:
          return [];
      }
    },
    [user],
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
