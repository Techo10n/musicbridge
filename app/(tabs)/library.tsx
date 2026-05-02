import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useLibrary } from '../../hooks/useLibrary';
import { LibraryArtist, LibraryPlaylist, LibraryTrack, Track, User } from '../../types';
import { LibraryPlaylistDetailModal } from '../../components/LibraryPlaylistDetailModal';
import { FriendPickerModal } from '../../components/FriendPickerModal';
import { deleteReelList, getSavedReelLists, SavedReelList } from '../../lib/reelLists';
import { sendPushNotification } from '../../lib/notifications';
import { AppBar, Avatar, Chip, CoverArt, IconBtn, SectionTitle, ServiceDot, serviceLabelShort } from '../../components/ui';
import { colors } from '../../lib/theme';

type FilterChip = 'all' | 'playlists' | 'songs' | 'reels' | 'artists';
type SortMode = 'recent' | 'name' | 'count';
type ReelEntry =
  | { kind: 'song'; id: string; track: LibraryTrack; sourceTitle: string; createdAt: string }
  | { kind: 'list'; id: string; list: SavedReelList };

const PLAYLIST_SEARCH_PRELOAD_LIMIT = 35;

function normalizeSearch(value: string): string {
  return value.toLowerCase().trim();
}

function compareName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

function normalizeTrackKey(title: string, artist: string): string {
  return `${normalizeSearch(title).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()}::${normalizeSearch(artist).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()}`;
}

function toTrackPayload(t: LibraryTrack): Track {
  return {
    title: t.title,
    artist: t.artist,
    spotify_id: t.service === 'spotify' ? t.id : null,
    apple_music_id: t.service === 'apple_music' ? t.id : null,
    youtube_music_id: t.service === 'youtube_music' ? t.id : null,
  };
}

export default function LibraryScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const primaryService = user?.primary_service ?? null;
  const router = useRouter();
  const { playlists, savedTracks, followedArtists, loading, error, fetchLibrary, getPlaylistTracks } = useLibrary();

  const [filter, setFilter] = useState<FilterChip>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedPlaylist, setSelectedPlaylist] = useState<LibraryPlaylist | null>(null);
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState<LibraryTrack[] | null>(null);
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [playlistTrackIndex, setPlaylistTrackIndex] = useState<Record<string, LibraryTrack[]>>({});
  const [savedReelLists, setSavedReelLists] = useState<SavedReelList[]>([]);
  const [selectedReelList, setSelectedReelList] = useState<SavedReelList | null>(null);
  const [reelSongsVisible, setReelSongsVisible] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pendingSongShare, setPendingSongShare] = useState<LibraryTrack | null>(null);
  const [pendingPlaylistShare, setPendingPlaylistShare] = useState<LibraryPlaylist | null>(null);
  const [sharingSong, setSharingSong] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fetchedLibraryKey = useRef<string | null>(null);

  const loadReelLists = useCallback(async () => {
    if (!userId) { setSavedReelLists([]); return; }
    try {
      const lists = await getSavedReelLists(userId);
      setSavedReelLists(lists);
    } catch { setSavedReelLists([]); }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadReelLists();
    const key = userId && primaryService ? `${userId}:${primaryService}` : null;
    if (key && fetchedLibraryKey.current !== key) {
      fetchedLibraryKey.current = key;
      void fetchLibrary();
    }
  }, [fetchLibrary, loadReelLists, primaryService, userId]));

  const handleRefresh = async () => { await Promise.all([fetchLibrary(), loadReelLists()]); };

  useEffect(() => {
    let cancelled = false;

    async function preloadPlaylistTracks() {
      const candidates = playlists.filter((playlist) => playlist.id !== '__liked_songs__' && playlist.id !== '__liked_music__');
      const nextIndex: Record<string, LibraryTrack[]> = {};

      for (const playlist of candidates) {
        try {
          const tracks = await getPlaylistTracks(playlist.id, PLAYLIST_SEARCH_PRELOAD_LIMIT);
          if (cancelled) return;
          nextIndex[playlist.id] = tracks;
        } catch {
          if (!cancelled) nextIndex[playlist.id] = [];
        }
      }

      if (!cancelled) setPlaylistTrackIndex(nextIndex);
    }

    setPlaylistTrackIndex({});
    if (playlists.length > 0) void preloadPlaylistTracks();

    return () => {
      cancelled = true;
    };
  }, [getPlaylistTracks, playlists]);

  const openPlaylist = (playlist: LibraryPlaylist, tracks: LibraryTrack[] | null = null) => {
    setSelectedPlaylist(playlist);
    setSelectedPlaylistTracks(tracks);
    setPlaylistModalVisible(true);
  };

  const closePlaylist = () => {
    setPlaylistModalVisible(false);
    setSelectedPlaylistTracks(null);
  };

  const handleSongShareFriendSelected = async (friend: User, message: string) => {
    if (!user || (!pendingSongShare && !pendingPlaylistShare)) return;
    setSharingSong(true);
    try {
      if (pendingSongShare) {
        const { data: insertedItem, error: dbError } = await supabase.from('shared_items').insert({
          sender_id: user.id, recipient_id: friend.id, type: 'song',
          title: pendingSongShare.title, artist: pendingSongShare.artist,
          cover_image_url: pendingSongShare.coverUrl,
          spotify_id: pendingSongShare.service === 'spotify' ? pendingSongShare.id : null,
          apple_music_id: pendingSongShare.service === 'apple_music' ? pendingSongShare.id : null,
          youtube_music_id: pendingSongShare.service === 'youtube_music' ? pendingSongShare.id : null,
          message: message || null,
        }).select('id').single();
        if (dbError) throw dbError;
        if (insertedItem?.id) sendPushNotification(friend.id, 'new_share', insertedItem.id);
        Alert.alert('Sent!', `Shared "${pendingSongShare.title}" with ${friend.display_name}.`);
      } else if (pendingPlaylistShare) {
        const tracks = await getPlaylistTracks(pendingPlaylistShare.id);
        const { data: insertedItem, error: dbError } = await supabase.from('shared_items').insert({
          sender_id: user.id,
          recipient_id: friend.id,
          type: 'playlist',
          title: pendingPlaylistShare.name,
          artist: null,
          cover_image_url: pendingPlaylistShare.coverUrl,
          spotify_playlist_id: pendingPlaylistShare.service === 'spotify' ? pendingPlaylistShare.id : null,
          apple_music_playlist_id: pendingPlaylistShare.service === 'apple_music' ? pendingPlaylistShare.id : null,
          youtube_music_playlist_id: pendingPlaylistShare.service === 'youtube_music' ? pendingPlaylistShare.id : null,
          tracks: tracks.map(toTrackPayload),
          message: message || null,
        }).select('id').single();
        if (dbError) throw dbError;
        if (insertedItem?.id) sendPushNotification(friend.id, 'new_share', insertedItem.id);
        Alert.alert('Sent!', `Shared "${pendingPlaylistShare.name}" with ${friend.display_name}.`);
      }
    } catch { Alert.alert('Error', 'Failed to share. Try again.'); }
    finally { setSharingSong(false); setPendingSongShare(null); setPendingPlaylistShare(null); }
  };

  const handleDeleteReelList = () => {
    if (!user || !selectedReelList) return;
    Alert.alert('Delete reel list?', 'This removes the saved list.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteReelList(user.id, selectedReelList.id); setSelectedReelList(null); await loadReelLists(); }
        catch { Alert.alert('Error', 'Could not delete.'); }
      }},
    ]);
  };

  const handleArtistPress = (artist: LibraryArtist) => {
    Alert.alert('Artist page unavailable', `${artist.name} artist pages are not currently available.`);
  };

  const reelSongs = useMemo(() => savedReelLists.flatMap((list) => (
    list.songs.map((song, index) => ({
      ...song,
      id: `${list.id}:${index}`,
      sourceListId: list.id,
      sourceTitle: list.title,
      sourceCreatedAt: list.createdAt,
    }))
  )), [savedReelLists]);
  const indexedPlaylistSongs = useMemo(() => playlists.flatMap((playlist) => (
    (playlistTrackIndex[playlist.id] ?? []).map((track) => ({
      ...track,
      playlistId: playlist.id,
      playlistName: playlist.name,
    }))
  )), [playlistTrackIndex, playlists]);
  const allSongRows = useMemo(() => [
    ...savedTracks.map((track, index) => ({ kind: 'saved' as const, track, sortIndex: index })),
    ...indexedPlaylistSongs.map((track, index) => ({ kind: 'playlist' as const, track, sortIndex: savedTracks.length + index })),
  ], [indexedPlaylistSongs, savedTracks]);
  const reelSongRows = useMemo(() => reelSongs.map((song, index) => ({
      kind: 'reel' as const,
      track: {
        id: song.id,
        title: song.title,
        artist: song.artist,
        coverUrl: song.coverUrl ?? '',
        service: (user?.primary_service ?? 'spotify') as LibraryTrack['service'],
      },
      sourceTitle: song.sourceTitle,
      sourceListId: song.sourceListId,
      sortIndex: index,
    })), [reelSongs, user?.primary_service]);
  const sortedPlaylists = useMemo(() => [...playlists].sort((a, b) => {
    if (sortMode === 'name') return compareName(a.name, b.name);
    if (sortMode === 'count') return b.trackCount - a.trackCount;
    return 0;
  }), [playlists, sortMode]);
  const sortedSongs = useMemo(() => [...allSongRows].sort((a, b) => {
    if (sortMode === 'name') return compareName(a.track.title, b.track.title);
    if (sortMode === 'count') {
      const countA = allSongRows.filter(row => normalizeTrackKey(row.track.title, row.track.artist) === normalizeTrackKey(a.track.title, a.track.artist)).length;
      const countB = allSongRows.filter(row => normalizeTrackKey(row.track.title, row.track.artist) === normalizeTrackKey(b.track.title, b.track.artist)).length;
      return countB - countA || compareName(a.track.title, b.track.title);
    }
    return a.sortIndex - b.sortIndex;
  }), [allSongRows, sortMode]);
  const allSongsTracks = useMemo(() => {
    const seen = new Map<string, LibraryTrack>();
    sortedSongs.forEach((row) => {
      const key = normalizeTrackKey(row.track.title, row.track.artist);
      if (!seen.has(key)) seen.set(key, row.track);
    });
    return [...seen.values()];
  }, [sortedSongs]);
  const allSongsPlaylist = useMemo<LibraryPlaylist>(() => ({
    id: '__all_songs__',
    name: 'All Songs',
    coverUrl: '',
    trackCount: allSongsTracks.length,
    service: (primaryService ?? 'spotify') as LibraryTrack['service'],
  }), [allSongsTracks.length, primaryService]);
  const sortedReelSongs = useMemo(() => [...reelSongRows].sort((a, b) => {
    if (sortMode === 'name') return compareName(a.track.title, b.track.title);
    if (sortMode === 'count') return compareName(a.track.artist, b.track.artist);
    return a.sortIndex - b.sortIndex;
  }), [reelSongRows, sortMode]);
  const reelEntries = useMemo<ReelEntry[]>(() => {
    const entries: ReelEntry[] = [];
    savedReelLists.forEach((list) => {
      if (list.songs.length > 1) {
        entries.push({ kind: 'list', id: list.id, list });
        return;
      }

      const song = list.songs[0];
      if (!song) return;
      entries.push({
        kind: 'song',
        id: `${list.id}:0`,
        sourceTitle: list.title,
        createdAt: list.createdAt,
        track: {
          id: `${list.id}:0`,
          title: song.title,
          artist: song.artist,
          coverUrl: song.coverUrl ?? '',
          service: (primaryService ?? 'spotify') as LibraryTrack['service'],
        },
      });
    });

    return entries.sort((a, b) => {
      if (sortMode === 'name') {
        const nameA = a.kind === 'list' ? a.list.title : a.track.title;
        const nameB = b.kind === 'list' ? b.list.title : b.track.title;
        return compareName(nameA, nameB);
      }
      if (sortMode === 'count') {
        const countA = a.kind === 'list' ? a.list.songs.length : 1;
        const countB = b.kind === 'list' ? b.list.songs.length : 1;
        return countB - countA;
      }
      const dateA = a.kind === 'list' ? a.list.createdAt : a.createdAt;
      const dateB = b.kind === 'list' ? b.list.createdAt : b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });
  }, [primaryService, savedReelLists, sortMode]);
  const sortedArtists = useMemo(() => [...followedArtists].sort((a, b) => {
    if (sortMode === 'name' || sortMode === 'count') return compareName(a.name, b.name);
    return 0;
  }), [followedArtists, sortMode]);
  const showPlaylists = filter === 'all' || filter === 'playlists';
  const showSongs = filter === 'all' || filter === 'songs';
  const showReels = filter === 'all' || filter === 'reels';
  const showArtists = filter === 'all' || filter === 'artists';
  const showSongsSection = showSongs;
  const showReelSongsSection = showReels && reelEntries.length > 0;
  const filterOptions: Array<{ id: FilterChip; label: string; count: number }> = [
    { id: 'all', label: 'All', count: playlists.length + sortedSongs.length + reelEntries.length + followedArtists.length },
    { id: 'playlists', label: 'Playlists', count: playlists.length },
    { id: 'songs', label: 'Songs', count: sortedSongs.length },
    { id: 'reels', label: 'Reels', count: reelEntries.length },
    { id: 'artists', label: 'Artists', count: followedArtists.length },
  ];
  const hasVisibleContent = (
    (showPlaylists && playlists.length > 0)
    || showSongsSection
    || showReelSongsSection
    || (showArtists && followedArtists.length > 0)
  );
  const dedupedSearchSongs = useMemo(() => {
    const map = new Map<string, {
      id: string;
      title: string;
      artist: string;
      coverUrl: string;
      track: LibraryTrack;
      playlistNames: string[];
      sourceTitles: string[];
    }>();

    [...sortedSongs, ...sortedReelSongs].forEach((row) => {
      const key = normalizeTrackKey(row.track.title, row.track.artist);
      const existing = map.get(key);
      const playlistName = row.kind === 'playlist'
        ? (row.track as LibraryTrack & { playlistName?: string }).playlistName
        : undefined;
      const sourceTitle = row.kind === 'reel'
        ? (row as { sourceTitle?: string }).sourceTitle
        : undefined;

      if (!existing) {
        map.set(key, {
          id: key,
          title: row.track.title,
          artist: row.track.artist,
          coverUrl: row.track.coverUrl,
          track: row.track,
          playlistNames: playlistName ? [playlistName] : [],
          sourceTitles: sourceTitle ? [sourceTitle] : [],
        });
        return;
      }

      if (!existing.coverUrl && row.track.coverUrl) existing.coverUrl = row.track.coverUrl;
      if (playlistName && !existing.playlistNames.includes(playlistName)) existing.playlistNames.push(playlistName);
      if (sourceTitle && !existing.sourceTitles.includes(sourceTitle)) existing.sourceTitles.push(sourceTitle);
    });

    return [...map.values()];
  }, [sortedReelSongs, sortedSongs]);
  const normalizedQuery = normalizeSearch(searchQuery);
  const searchResults = useMemo(() => {
    const queryMatchesSongTitle = normalizedQuery
      ? dedupedSearchSongs.some((song) => normalizeSearch(song.title).includes(normalizedQuery))
      : false;

    return [
      ...(!queryMatchesSongTitle ? playlists.map((playlist) => ({
        id: `playlist:${playlist.id}`,
        title: playlist.name,
        subtitle: `${playlist.trackCount || playlistTrackIndex[playlist.id]?.length || 0} tracks · ${serviceLabelShort(playlist.service)}`,
        searchText: [
          playlist.name,
          serviceLabelShort(playlist.service),
        ].join(' '),
        coverUrl: playlist.coverUrl,
        onPress: () => {
          openPlaylist(playlist);
        },
      })) : []),
      ...dedupedSearchSongs.map((song) => ({
        id: `track:${song.id}`,
        title: song.title,
        subtitle: [
          song.artist,
          song.playlistNames.length > 1
            ? `${song.playlistNames.length} playlists`
            : song.playlistNames[0],
          song.sourceTitles.length > 0 ? 'Reel' : '',
        ].filter(Boolean).join(' · '),
        searchText: [
          song.title,
          song.artist,
          ...song.playlistNames,
          ...song.sourceTitles,
        ].join(' '),
        coverUrl: song.coverUrl,
        onPress: () => {
          setPendingSongShare(song.track);
          setPendingPlaylistShare(null);
          setPickerVisible(true);
        },
      })),
      ...savedReelLists.map((list) => ({
        id: `reel:${list.id}`,
        title: list.title,
        subtitle: `${list.songs.length} songs · Reel`,
        searchText: [
          list.title,
          ...list.songs.flatMap((song) => [song.title, song.artist]),
        ].join(' '),
        coverUrl: list.songs[0]?.coverUrl ?? null,
        onPress: () => {
          setSelectedReelList(list);
        },
      })),
      ...followedArtists.map((artist) => ({
        id: `artist:${artist.id}`,
        title: artist.name,
        subtitle: 'Followed artist',
        searchText: artist.name,
        coverUrl: artist.imageUrl,
        onPress: () => handleArtistPress(artist),
      })),
    ].filter((entry) => {
      if (!normalizedQuery) return true;
      return normalizeSearch(entry.searchText).includes(normalizedQuery);
    });
  }, [dedupedSearchSongs, followedArtists, normalizedQuery, playlistTrackIndex, playlists, savedReelLists]);

  if (!user?.primary_service) {
    return (
      <View style={styles.emptyScreen}>
        <Ionicons name="library-outline" size={52} color={colors.fg4} />
        <Text style={styles.emptyTitle}>No music service connected</Text>
        <Text style={styles.emptySubtitle}>Connect a streaming service in Profile to see your library here.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <AppBar
        title="Library"
        right={
          <>
            <IconBtn name="search-outline" onPress={() => setSearchVisible(true)} />
            <IconBtn name="paper-plane-outline" onPress={() => router.push('/(tabs)/friends' as any)} />
          </>
        }
      />

      {/* Filter rail */}
      <ScrollView
        horizontal
        style={styles.filterRailScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRail}
      >
        {filterOptions.map((option) => (
          <View key={option.id} style={styles.filterChipWrap}>
            <Chip
              label={option.label}
              active={filter === option.id}
              onPress={() => setFilter(option.id)}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.sortRail}>
        {([
          ['recent', 'Recent'],
          ['name', 'Name'],
          ['count', 'Count'],
        ] as Array<[SortMode, string]>).map(([mode, label]) => (
          <TouchableOpacity
            key={mode}
            style={[styles.sortChip, sortMode === mode && styles.sortChipActive]}
            onPress={() => setSortMode(mode)}
            activeOpacity={0.8}
          >
            <Text style={[styles.sortChipText, sortMode === mode && styles.sortChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !playlists.length ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading your library…</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyScreen}>
          <Ionicons name="warning-outline" size={40} color={colors.coral} />
          <Text style={styles.emptyTitle}>Couldn't load library</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchLibrary}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={colors.primary} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        >

          {/* Playlists */}
          {showPlaylists && playlists.length > 0 && (
            <>
              <SectionTitle
                title="Playlists"
                right={<Text style={styles.sortLabel}>{sortMode === 'recent' ? 'Recent' : sortMode === 'name' ? 'A-Z' : 'Most songs'}</Text>}
              />
              <View style={styles.listSection}>
                {sortedPlaylists.map((p, i) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.row, i < sortedPlaylists.length - 1 && styles.rowSep]}
                    onPress={() => openPlaylist(p)}
                    activeOpacity={0.8}
                  >
                    <CoverArt uri={p.coverUrl} size={56} radius={10} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{p.name}</Text>
                      <View style={styles.rowMeta}>
                        <ServiceDot service={p.service} size={8} />
                        <Text style={styles.rowMetaText}>
                          {p.trackCount > 0 ? `${p.trackCount} tracks` : serviceLabelShort(p.service)}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.rowAction}
                      onPress={() => { setPendingSongShare(null); setPendingPlaylistShare(p); setPickerVisible(true); }}
                      disabled={sharingSong}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="paper-plane-outline" size={18} color={colors.fg3} />
                    </TouchableOpacity>
                    <Ionicons name="chevron-forward" size={16} color={colors.fg3} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Songs */}
          {showSongsSection && (
            <>
              <SectionTitle
                title="Songs"
                right={<Text style={styles.sortLabel}>{allSongsTracks.length} songs</Text>}
              />
              <View style={styles.listSection}>
                {filter === 'songs' ? (
                  sortedSongs.map((row, i) => (
                    <View key={`${row.kind}-${row.track.id}-${i}`} style={[styles.row, i < sortedSongs.length - 1 && styles.rowSep]}>
                      <CoverArt uri={row.track.coverUrl} size={44} radius={8} />
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{row.track.title}</Text>
                        <Text style={styles.rowMetaText} numberOfLines={1}>
                          {row.kind === 'playlist'
                            ? `${row.track.artist} · ${(row.track as LibraryTrack & { playlistName?: string }).playlistName}`
                            : row.track.artist}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.rowAction}
                        onPress={() => { setPendingSongShare(row.track); setPendingPlaylistShare(null); setPickerVisible(true); }}
                        disabled={sharingSong}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="paper-plane-outline" size={18} color={colors.fg3} />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => openPlaylist(allSongsPlaylist, allSongsTracks)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.allSongsIcon}>
                      <Ionicons name="albums" size={24} color={colors.primaryInk} />
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>All Songs</Text>
                      <Text style={styles.rowMetaText}>{allSongsTracks.length} songs across your library</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.fg3} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Reel songs */}
          {showReels && reelEntries.length > 0 && (
            <>
              <SectionTitle
                title={filter === 'reels' ? 'Reel Songs' : 'Reels'}
                right={<Text style={styles.sortLabel}>{reelEntries.length} item{reelEntries.length === 1 ? '' : 's'}</Text>}
              />
              <View style={styles.listSection}>
                {filter === 'reels' ? (
                  reelEntries.map((entry, idx) => {
                    if (entry.kind === 'list') {
                      return (
                        <TouchableOpacity
                          key={entry.id}
                          style={[styles.row, idx < reelEntries.length - 1 && styles.rowSep]}
                          onPress={() => setSelectedReelList(entry.list)}
                          activeOpacity={0.8}
                        >
                          <View style={styles.reelListIcon}>
                            <Ionicons name="list-outline" size={24} color={colors.primaryInk} />
                          </View>
                          <View style={styles.rowInfo}>
                            <Text style={styles.rowTitle} numberOfLines={1}>{entry.list.title}</Text>
                            <Text style={styles.rowMetaText}>{entry.list.songs.length} songs · Reel list</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color={colors.fg3} />
                        </TouchableOpacity>
                      );
                    }

                    return (
                      <TouchableOpacity
                        key={entry.id}
                        style={[styles.row, idx < reelEntries.length - 1 && styles.rowSep]}
                        onPress={() => { setPendingSongShare(entry.track); setPendingPlaylistShare(null); setPickerVisible(true); }}
                        activeOpacity={0.8}
                      >
                        <CoverArt uri={entry.track.coverUrl} size={44} radius={8} />
                        <View style={styles.rowInfo}>
                          <Text style={styles.rowTitle} numberOfLines={1}>{entry.track.title}</Text>
                          <Text style={styles.rowMetaText} numberOfLines={1}>{entry.track.artist}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.rowAction}
                          onPress={() => { setPendingSongShare(entry.track); setPendingPlaylistShare(null); setPickerVisible(true); }}
                          disabled={sharingSong}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="paper-plane-outline" size={18} color={colors.fg3} />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })
                ) : (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => setReelSongsVisible(true)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.reelSongsIcon}>
                      <Ionicons name="film-outline" size={24} color={colors.primaryInk} />
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>Reel Songs</Text>
                      <Text style={styles.rowMetaText}>{reelEntries.length} saved reel item{reelEntries.length === 1 ? '' : 's'}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.fg3} />
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}

          {/* Followed artists */}
          {showArtists && followedArtists.length > 0 && (
            <>
              <SectionTitle title="Followed Artists" />
              <FlatList
                data={sortedArtists}
                horizontal
                showsHorizontalScrollIndicator={false}
                keyExtractor={a => a.id}
                contentContainerStyle={styles.artistList}
                renderItem={({ item: artist }) => (
                  <TouchableOpacity style={styles.artistChip} onPress={() => handleArtistPress(artist)} activeOpacity={0.8}>
                    {artist.imageUrl
                      ? <Image source={{ uri: artist.imageUrl }} style={styles.artistImage} />
                      : <Avatar name={artist.name} size={64} />
                    }
                    <Text style={styles.artistName} numberOfLines={2}>{artist.name}</Text>
                  </TouchableOpacity>
                )}
              />
            </>
          )}

          {/* Empty */}
          {!hasVisibleContent && (
            <View style={styles.emptyInline}>
              <Ionicons name="library-outline" size={44} color={colors.fg4} />
              <Text style={styles.emptyInlineTitle}>No Results.</Text>
              <Text style={styles.emptyInlineSub}>There is no saved content for this filter yet.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <LibraryPlaylistDetailModal
        playlist={selectedPlaylist}
        visible={playlistModalVisible}
        onClose={closePlaylist}
        preloadedTracks={selectedPlaylistTracks}
      />

      <FriendPickerModal
        visible={pickerVisible}
        title={pendingSongShare ? `Share "${pendingSongShare.title}"` : pendingPlaylistShare ? `Share "${pendingPlaylistShare.name}"` : 'Share'}
        onClose={() => { setPickerVisible(false); setPendingSongShare(null); setPendingPlaylistShare(null); }}
        onSelect={handleSongShareFriendSelected}
      />

      <Modal visible={reelSongsVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setReelSongsVisible(false)}>
        <View style={styles.reelModal}>
          <View style={styles.reelModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reelModalTitle} numberOfLines={1}>Reel Songs</Text>
              <Text style={styles.reelModalSub}>{reelEntries.length} item{reelEntries.length === 1 ? '' : 's'}</Text>
            </View>
            <TouchableOpacity onPress={() => setReelSongsVisible(false)} style={styles.iconPad}>
              <Ionicons name="close" size={22} color={colors.fg3} />
            </TouchableOpacity>
          </View>
          {reelEntries.length === 0 ? (
            <View style={styles.emptyInline}>
              <Ionicons name="film-outline" size={44} color={colors.fg4} />
              <Text style={styles.emptyInlineTitle}>No Results.</Text>
              <Text style={styles.emptyInlineSub}>Saved songs from reels will appear here.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}>
              {reelEntries.map((entry, idx) => {
                if (entry.kind === 'list') {
                  return (
                    <TouchableOpacity
                      key={entry.id}
                      style={[styles.row, idx > 0 && styles.rowSep]}
                      onPress={() => {
                        setReelSongsVisible(false);
                        setSelectedReelList(entry.list);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={styles.reelListIcon}>
                        <Ionicons name="list-outline" size={24} color={colors.primaryInk} />
                      </View>
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{entry.list.title}</Text>
                        <Text style={styles.rowMetaText}>{entry.list.songs.length} songs · Reel list</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.fg3} />
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={entry.id}
                    style={[styles.row, idx > 0 && styles.rowSep]}
                    onPress={() => {
                      setReelSongsVisible(false);
                      setPendingSongShare(entry.track);
                      setPendingPlaylistShare(null);
                      setPickerVisible(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <CoverArt uri={entry.track.coverUrl} size={44} radius={8} />
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{entry.track.title}</Text>
                      <Text style={styles.rowMetaText} numberOfLines={1}>{entry.track.artist}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.rowAction}
                      onPress={() => {
                        setReelSongsVisible(false);
                        setPendingSongShare(entry.track);
                        setPendingPlaylistShare(null);
                        setPickerVisible(true);
                      }}
                      disabled={sharingSong}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="paper-plane-outline" size={18} color={colors.fg3} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* Reel list detail modal */}
      <Modal visible={selectedReelList !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedReelList(null)}>
        <View style={styles.reelModal}>
          <View style={styles.reelModalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reelModalTitle} numberOfLines={1}>{selectedReelList?.title ?? 'Reel list'}</Text>
              <Text style={styles.reelModalSub}>{selectedReelList?.songs.length ?? 0} songs</Text>
            </View>
            <TouchableOpacity onPress={handleDeleteReelList} style={styles.iconPad}>
              <Ionicons name="trash-outline" size={20} color={colors.coral} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedReelList(null)} style={styles.iconPad}>
              <Ionicons name="close" size={22} color={colors.fg3} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}>
            {selectedReelList?.songs.map((song, idx) => (
              <View key={`${song.title}-${idx}`} style={[styles.row, idx > 0 && styles.rowSep]}>
                <View style={styles.trackIdx}>
                  <Text style={styles.trackIdxText}>{String(idx + 1).padStart(2, '0')}</Text>
                </View>
                <CoverArt uri={song.coverUrl} size={42} radius={6} />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
                  <Text style={styles.rowMetaText} numberOfLines={1}>{song.artist}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSearchVisible(false)}>
        <View style={styles.searchModal}>
          <View style={styles.searchModalHeader}>
            <Text style={styles.searchModalTitle}>Search Library</Text>
            <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }}>
              <Ionicons name="close" size={22} color={colors.fg3} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchInputRow}>
            <Ionicons name="search-outline" size={16} color={colors.fg3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search playlists, songs, reels, artists…"
              placeholderTextColor={colors.fg4}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.searchEmptyText}>No matching library items.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchRow}
                onPress={() => {
                  setSearchVisible(false);
                  setSearchQuery('');
                  item.onPress();
                }}
                activeOpacity={0.8}
              >
                <CoverArt uri={item.coverUrl} size={46} radius={8} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchRowTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.searchRowMeta} numberOfLines={1}>{item.subtitle}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  filterRailScroll: {
    flexGrow: 0,
    maxHeight: 52,
  },

  filterRail: {
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, gap: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterChipWrap: {
    alignSelf: 'flex-start',
  },

  sortLabel: { fontSize: 13, color: colors.fg3, fontWeight: '500' },
  sortRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: { color: colors.fg3, fontSize: 12, fontWeight: '600' },
  sortChipTextActive: { color: colors.primaryInk },

  listSection: {
    marginHorizontal: 16,
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    borderWidth: 1, borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.fg, marginBottom: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMetaText: { fontSize: 12, color: colors.fg3 },
  rowAction: { padding: 4 },
  reelListIcon: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  reelSongsIcon: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  allSongsIcon: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  artistList: { paddingHorizontal: 16, paddingBottom: 8, gap: 14 },
  artistChip: { alignItems: 'center', width: 80, gap: 6 },
  artistImage: { width: 64, height: 64, borderRadius: 32 },
  artistName: { fontSize: 11, color: colors.fg2, textAlign: 'center', lineHeight: 15 },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.fg3, fontSize: 14 },

  emptyScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.fg, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: colors.fg3, textAlign: 'center', lineHeight: 20 },

  emptyInline: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 10 },
  emptyInlineTitle: { fontSize: 16, fontWeight: '600', color: colors.fg3, textAlign: 'center' },
  emptyInlineSub: { fontSize: 13, color: colors.fg4, textAlign: 'center', lineHeight: 18 },

  retryBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  retryBtnText: { color: colors.primaryInk, fontSize: 15, fontWeight: '600' },

  reelModal: { flex: 1, backgroundColor: colors.bg },
  reelModalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  reelModalTitle: { fontSize: 18, fontWeight: '700', color: colors.fg },
  reelModalSub: { fontSize: 13, color: colors.fg3, marginTop: 2 },
  iconPad: { padding: 6 },

  trackIdx: { width: 28, alignItems: 'flex-end' },
  trackIdxText: { fontSize: 11, color: colors.fg3, fontVariant: ['tabular-nums'] },

  searchModal: { flex: 1, backgroundColor: colors.bg },
  searchModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchModalTitle: { fontSize: 20, fontWeight: '700', color: colors.fg },
  searchInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, backgroundColor: colors.bgCard, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, color: colors.fg, fontSize: 14 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchRowTitle: { color: colors.fg, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  searchRowMeta: { color: colors.fg3, fontSize: 12 },
  searchEmptyText: { color: colors.fg4, fontSize: 14, textAlign: 'center', marginTop: 48 },
});
