import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal,
  RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { useLibrary } from '../../hooks/useLibrary';
import { useConversions } from '../../hooks/useConversions';
import { ShareDraft } from '../../lib/sharing';
import { LibraryArtist, LibraryPlaylist, LibraryTrack } from '../../types';
import { LibraryPlaylistDetailModal } from '../../components/LibraryPlaylistDetailModal';
import { ShareComposer } from '../../components/ShareComposer';
import { AppBar, Avatar, Chip, CoverArt, IconBtn, ListRow, SectionTitle, SortMenu } from '../../components/ui';
import { serviceLabelShort } from '../../lib/services';
import { makeStyles, useTheme } from '../../lib/theme';

type FilterChip = 'all' | 'playlists' | 'songs' | 'artists';
type SortMode = 'recent' | 'name' | 'count';

// One list, so the trigger and the sheet cannot disagree about what a mode is
// called. 'count' reads as "Most songs" because that is what it does here.
const SORT_OPTIONS: readonly { id: SortMode; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'name', label: 'A\u2013Z' },
  { id: 'count', label: 'Most songs' },
];

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

/** Playlists being added to your service, and the ones that just finished. */
function ConversionsSection() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { conversions, dismiss } = useConversions();

  const runs = Object.values(conversions);
  if (runs.length === 0) return null;

  return (
    <>
      <SectionTitle title="Conversions" />
      <View style={styles.list}>
        {runs.map((run, i) => {
          const running = run.state === 'waiting' || run.state === 'processing';
          return (
            <TouchableOpacity
              key={run.itemId}
              style={[styles.row, i < runs.length - 1 && styles.rowSep]}
              onPress={() => router.push(`/playlist/${run.itemId}`)}
              activeOpacity={0.8}
            >
              <View style={styles.allSongsIcon}>
                <Ionicons
                  name={running ? 'sync' : run.state === 'done' ? 'checkmark' : 'alert'}
                  size={22}
                  color={colors.accentInk}
                />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>{run.title}</Text>
                <Text style={styles.rowMetaText}>
                  {running
                    ? `Adding · ${run.processed} of ${run.total}`
                    : run.state === 'done'
                      ? `Added${run.matched != null ? ` · ${run.matched} of ${run.total}` : ''}`
                      : 'Did not finish'}
                </Text>
              </View>
              {!running ? (
                <TouchableOpacity
                  onPress={() => dismiss(run.itemId)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Dismiss ${run.title}`}
                >
                  <Ionicons name="close" size={18} color={colors.text3} />
                </TouchableOpacity>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export default function LibraryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const primaryService = user?.primary_service ?? null;
  const router = useRouter();
  const { playlists, savedTracks, followedArtists, loading, error, fetchLibrary, getPlaylistTracks } = useLibrary();

  const [filter, setFilter] = useState<FilterChip>('all');
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [selectedPlaylist, setSelectedPlaylist] = useState<LibraryPlaylist | null>(null);
  const [selectedPlaylistTracks, setSelectedPlaylistTracks] = useState<LibraryTrack[] | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [playlistTrackIndex, setPlaylistTrackIndex] = useState<Record<string, LibraryTrack[]>>({});
  const [shareDraft, setShareDraft] = useState<ShareDraft | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fetchedLibraryKey = useRef<string | null>(null);


  useFocusEffect(useCallback(() => {
    const key = userId && primaryService ? `${userId}:${primaryService}` : null;
    if (key && fetchedLibraryKey.current !== key) {
      fetchedLibraryKey.current = key;
      void fetchLibrary();
    }
  }, [fetchLibrary, primaryService, userId]));

  const handleRefresh = async () => { await fetchLibrary(); };

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

    void (async () => {
      if (cancelled) return;
      setPlaylistTrackIndex({});
      if (playlists.length > 0) await preloadPlaylistTracks();
    })();

    return () => {
      cancelled = true;
    };
  }, [getPlaylistTracks, playlists]);

  const openPlaylist = (playlist: LibraryPlaylist, tracks: LibraryTrack[] | null = null) => {
    setSelectedPlaylist(playlist);
    setSelectedPlaylistTracks(tracks);
    setDetailVisible(true);
  };

  const closePlaylist = () => {
    setDetailVisible(false);
    setSelectedPlaylistTracks(null);
  };

  const shareSong = (track: LibraryTrack) => {
    setShareDraft({
      kind: 'song',
      title: track.title,
      artist: track.artist,
      coverUrl: track.coverUrl,
      service: track.service,
      serviceId: track.id,
      isrc: track.isrc,
      ytTopicVerified: track.ytTopicVerified,
    });
  };

  // A playlist share stores its tracks rather than a reference, so they have to
  // be read before the composer opens. `sendShare` refuses an empty list, but
  // failing here means the user never gets as far as picking a recipient.
  const handleArtistPress = (artist: LibraryArtist) => {
    setSearchQuery(artist.name);
    setSearchVisible(true);
  };

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
  const sortedArtists = useMemo(() => [...followedArtists].sort((a, b) => {
    if (sortMode === 'name' || sortMode === 'count') return compareName(a.name, b.name);
    return 0;
  }), [followedArtists, sortMode]);
  const showPlaylists = filter === 'all' || filter === 'playlists';
  const showSongs = filter === 'all' || filter === 'songs';
  const showArtists = filter === 'all' || filter === 'artists';
  const showSongsSection = showSongs;
  // Sort lives in a section header. Which header depends on what the filter
  // left on screen, because the control has to stay reachable under every one.
  const sortAnchor: 'playlists' | 'songs' | 'artists' | null =
    (showPlaylists && playlists.length > 0) ? 'playlists'
      : showSongsSection ? 'songs'
        : (showArtists && followedArtists.length > 0) ? 'artists'
          : null;
  const sortControl = <SortMenu value={sortMode} options={SORT_OPTIONS} onChange={setSortMode} />;
  const filterOptions: { id: FilterChip; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: playlists.length + sortedSongs.length + followedArtists.length },
    { id: 'playlists', label: 'Playlists', count: playlists.length },
    { id: 'songs', label: 'Songs', count: sortedSongs.length },
    { id: 'artists', label: 'Artists', count: followedArtists.length },
  ];
  const hasVisibleContent = (
    (showPlaylists && playlists.length > 0)
    || showSongsSection
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
    }>();

    sortedSongs.forEach((row) => {
      const key = normalizeTrackKey(row.track.title, row.track.artist);
      const existing = map.get(key);
      const playlistName = row.kind === 'playlist'
        ? (row.track as LibraryTrack & { playlistName?: string }).playlistName
        : undefined;
      if (!existing) {
        map.set(key, {
          id: key,
          title: row.track.title,
          artist: row.track.artist,
          coverUrl: row.track.coverUrl,
          track: row.track,
          playlistNames: playlistName ? [playlistName] : [],
        });
        return;
      }

      if (!existing.coverUrl && row.track.coverUrl) existing.coverUrl = row.track.coverUrl;
      if (playlistName && !existing.playlistNames.includes(playlistName)) existing.playlistNames.push(playlistName);
    });

    return [...map.values()];
  }, [sortedSongs]);
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
        ].filter(Boolean).join(' · '),
        searchText: [
          song.title,
          song.artist,
          ...song.playlistNames,
        ].join(' '),
        coverUrl: song.coverUrl,
        onPress: () => {
          shareSong(song.track);
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
  }, [dedupedSearchSongs, followedArtists, normalizedQuery, playlistTrackIndex, playlists]);

  if (!user?.primary_service) {
    return (
      <View style={styles.emptyScreen}>
        <Ionicons name="library-outline" size={52} color={colors.text4} />
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
            <IconBtn name="search-outline" label="Search" onPress={() => setSearchVisible(true)} />
            <IconBtn name="paper-plane-outline" label="Send a song" onPress={() => router.push('/(tabs)/friends' as any)} />
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

      {loading && !playlists.length ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.accent} size="large" />
          <Text style={styles.loadingText}>Loading your library…</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyScreen}>
          <Ionicons name="warning-outline" size={40} color={colors.danger} />
          <Text style={styles.emptyTitle}>Couldn&apos;t load library</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchLibrary}>
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={handleRefresh} tintColor={colors.accent} />}
          contentContainerStyle={{ paddingBottom: 100 }}
        >

          <ConversionsSection />

          {/* Playlists */}
          {showPlaylists && playlists.length > 0 && (
            <>
              <SectionTitle
                title="Playlists"
                right={sortAnchor === 'playlists' ? sortControl : undefined}
              />
              <View style={styles.list}>
                {sortedPlaylists.map((p, i) => (
                  <ListRow
                    key={p.id}
                    leading={<CoverArt uri={p.coverUrl} size={52} radius={10} />}
                    title={p.name}
                    subtitle={p.trackCount > 0 ? `${p.trackCount} tracks` : serviceLabelShort(p.service)}
                    onPress={() => openPlaylist(p)}
                    separator={i < sortedPlaylists.length - 1}
                    trailing={<Ionicons name="chevron-forward" size={16} color={colors.text3} />}
                  />
                ))}
              </View>
            </>
          )}

          {/* Songs */}
          {showSongsSection && (
            <>
              <SectionTitle
                title="Songs"
                right={sortAnchor === 'songs' ? sortControl : (
                  <Text style={styles.sortLabel}>{allSongsTracks.length} songs</Text>
                )}
              />
              <View style={styles.list}>
                {filter === 'songs' ? (
                  sortedSongs.map((row, i) => (
                    <ListRow
                      key={`${row.kind}-${row.track.id}-${i}`}
                      leading={<CoverArt uri={row.track.coverUrl} size={44} radius={8} />}
                      title={row.track.title}
                      subtitle={row.kind === 'playlist'
                        ? `${row.track.artist} · ${(row.track as LibraryTrack & { playlistName?: string }).playlistName}`
                        : row.track.artist}
                      onPress={() => shareSong(row.track)}
                      separator={i < sortedSongs.length - 1}
                    />
                  ))
                ) : (
                  <ListRow
                    leading={
                      <View style={styles.allSongsIcon}>
                        <Ionicons name="albums" size={24} color={colors.accentInk} />
                      </View>
                    }
                    title="All Songs"
                    subtitle={`${allSongsTracks.length} songs across your library`}
                    onPress={() => openPlaylist(allSongsPlaylist, allSongsTracks)}
                    trailing={<Ionicons name="chevron-forward" size={16} color={colors.text3} />}
                  />
                )}
              </View>
            </>
          )}

          {/* Followed artists */}
          {showArtists && followedArtists.length > 0 && (
            <>
              <SectionTitle
                title="Followed Artists"
                right={sortAnchor === 'artists' ? sortControl : undefined}
              />
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
              <Ionicons name="library-outline" size={44} color={colors.text4} />
              <Text style={styles.emptyInlineTitle}>No Results.</Text>
              <Text style={styles.emptyInlineSub}>There is no saved content for this filter yet.</Text>
            </View>
          )}
        </ScrollView>
      )}

      <LibraryPlaylistDetailModal
        playlist={selectedPlaylist}
        visible={detailVisible}
        onClose={closePlaylist}
        preloadedTracks={selectedPlaylistTracks}
      />

      <ShareComposer
        visible={shareDraft !== null}
        draft={shareDraft}
        onClose={() => setShareDraft(null)}
      />

      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSearchVisible(false)}>
        <View style={styles.searchModal}>
          <View style={styles.searchModalHeader}>
            <Text style={styles.searchModalTitle}>Search Library</Text>
            <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }}>
              <Ionicons name="close" size={22} color={colors.text3} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchInputRow}>
            <Ionicons name="search-outline" size={16} color={colors.text3} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search playlists, songs, artists…"
              placeholderTextColor={colors.text4}
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

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
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

  sortLabel: { fontSize: 13, color: colors.text3, fontWeight: '500' },

  // Flat rows on the page background, like the send sheet. The card that used
  // to wrap these added a border and a fill around content that already reads
  // as a list, and made every section look like a separate surface.
  list: { marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  rowSep: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowInfo: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 3 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowMetaText: { fontSize: 12, color: colors.text3 },
  rowAction: { padding: 4 },
  allSongsIcon: {
    width: 56, height: 56, borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },

  artistList: { paddingHorizontal: 16, paddingBottom: 8, gap: 14 },
  artistChip: { alignItems: 'center', width: 80, gap: 6 },
  artistImage: { width: 64, height: 64, borderRadius: 32 },
  artistName: { fontSize: 11, color: colors.text2, textAlign: 'center', lineHeight: 15 },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.text3, fontSize: 14 },

  emptyScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: colors.text3, textAlign: 'center', lineHeight: 20 },

  emptyInline: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 10 },
  emptyInlineTitle: { fontSize: 16, fontWeight: '600', color: colors.text3, textAlign: 'center' },
  emptyInlineSub: { fontSize: 13, color: colors.text4, textAlign: 'center', lineHeight: 18 },

  retryBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
  retryBtnText: { color: colors.accentInk, fontSize: 15, fontWeight: '600' },

  searchModal: { flex: 1, backgroundColor: colors.bg },
  searchModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchModalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  searchInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, backgroundColor: colors.surface, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchRowTitle: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  searchRowMeta: { color: colors.text3, fontSize: 12 },
  searchEmptyText: { color: colors.text4, fontSize: 14, textAlign: 'center', marginTop: 48 },
}));
