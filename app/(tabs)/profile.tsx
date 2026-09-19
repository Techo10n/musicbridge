import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal,
  ScrollView, Share, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { useProfileStats } from '../../hooks/useProfileStats';
import { LibraryPlaylist, FavoriteSong } from '../../types';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { extractYouTubeTrackInfo } from '../../lib/youtubeMusic';
import { pickAndUploadAvatar } from '../../lib/avatarUpload';
import { supabase } from '../../lib/supabase';
import { AppBar, IconBtn, CoverArt, EmptyState, ServiceDot, SectionTitle, useToast } from '../../components/ui';
import { makeStyles, serviceColor, useTheme } from '../../lib/theme';
import { serviceLabel } from '../../lib/services';
import { monthWeekLabel, timeAgo } from '../../lib/utils';


export default function Profile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const { following, followers } = useFollows();
  const stats = useProfileStats();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState(0);

  // Shared songs for "public shares" list (using own sent items as proxy)
  const [publicShares, setPublicShares] = useState<any[]>([]);
  const [loadingPublic, setLoadingPublic] = useState(false);

  // Pinned playlist picker
  const [pinnedPickerVisible, setPinnedPickerVisible] = useState(false);
  const [libraryPlaylists, setLibraryPlaylists] = useState<LibraryPlaylist[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // Fav song
  const [favSongModalVisible, setFavSongModalVisible] = useState(false);
  const [favSearchQuery, setFavSearchQuery] = useState('');
  const favSearchQueryRef = useRef('');
  const [favSearchResults, setFavSearchResults] = useState<FavoriteSong[]>([]);
  const [searchingFav, setSearchingFav] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      try {
        const { count } = await supabase.from('shared_items').select('id', { count: 'exact', head: true }).eq('sender_id', user.id);
        setSharedCount(count ?? 0);
      } catch (err) {
        console.error('[profile] shared count fetch error:', err);
      }
    })();
    // Load public shares
    void (async () => {
      setLoadingPublic(true);
      try {
        // Same rule as the inbox query: never pull `tracks` for a list view.
        // Must stay one string literal for supabase-js row typing.
        const { data } = await supabase
          .from('shared_items')
          .select('id, sender_id, recipient_id, type, title, artist, cover_image_url, spotify_id, apple_music_id, youtube_music_id, spotify_playlist_id, apple_music_playlist_id, apple_music_playlist_url, youtube_music_playlist_id, tracks_count, message, opened, conversion_status, created_at')
          .eq('sender_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        // These are always the signed-in user's own shares, so `sender` is
        // just `user` — no need to hit `user_public_profiles` for it.
        const withSender = (data ?? []).map((item) => ({
          ...item,
          sender: {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_url: user.avatar_url,
            primary_service: user.primary_service,
          },
        }));
        setPublicShares(withSender);
      } catch (err) {
        console.error('[profile] public shares fetch error:', err);
      } finally { setLoadingPublic(false); }
    })();
  }, [user]);

  // Derived, not stored: `useFollows` already holds both lists, and mirroring
  // their lengths into state was a second source of truth that could lag.
  const followCounts = { followers: followers.length, following: following.length };

  // Drop the local preview once the uploaded avatar URL actually lands.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) setAvatarPreviewUri(null); });
    return () => { cancelled = true; };
  }, [user?.avatar_url]);

  const handleAvatarPress = async () => {
    if (!user || uploadingAvatar) return;
    setUploadingAvatar(true);
    try {
      const upload = await pickAndUploadAvatar(user.id);
      if (!upload) return;
      setAvatarPreviewUri(upload.localUri);
      await refreshUser();
    }
    catch { toast.show({ kind: 'error', message: 'Could not update photo' }); }
    finally { setUploadingAvatar(false); }
  };

  useEffect(() => {
    favSearchQueryRef.current = favSearchQuery;
  }, [favSearchQuery]);

  const handleFavSearch = useCallback(async (queryArg?: string) => {
    const query = (queryArg ?? favSearchQueryRef.current).trim();
    if (!user || !query) return;
    setSearchingFav(true);
    try {
      const results: FavoriteSong[] = [];
      if (user.spotify_access_token) {
        try {
          const tracks = await Spotify.searchTracks(user.id, query);
          for (const t of tracks.slice(0, 5)) results.push({ title: t.name, artist: t.artists.map(a => a.name).join(', '), service: 'spotify', service_id: t.id, cover_url: t.album.images[0]?.url ?? '' });
        } catch (err) {
          console.error('[Profile] Spotify favorite search failed:', query, err);
        }
      }
      if (user.apple_music_user_token) {
        try {
          const tracks = await AppleMusic.searchTracks(user.id, query);
          for (const t of tracks.slice(0, 5)) {
            results.push({
              title: t.attributes.name,
              artist: t.attributes.artistName,
              service: 'apple_music',
              service_id: t.id,
              cover_url: t.attributes.artwork ? AppleMusic.resolveArtworkUrl(t.attributes.artwork.url, 150) : '',
            });
          }
        } catch (err) {
          console.error('[Profile] Apple Music favorite search failed:', query, err);
        }
      }
      if (user.youtube_access_token) {
        try {
          const tracks = await YouTubeMusic.searchTracks(user.id, query);
          for (const t of tracks.slice(0, 3)) {
            if (results.length >= 8) break;
            const info = extractYouTubeTrackInfo(t.snippet.channelTitle, t.snippet.title);
            results.push({
              title: info.title,
              artist: info.artist,
              service: 'youtube_music',
              service_id: t.id.videoId,
              cover_url: t.snippet.thumbnails.medium?.url ?? '',
            });
          }
        } catch (err) {
          console.error('[Profile] YouTube Music favorite search failed:', query, err);
        }
      }
      setFavSearchResults(results);
    } finally { setSearchingFav(false); }
  }, [user]);

  useEffect(() => {
    if (!favSongModalVisible) return;
    const isEmpty = !favSearchQuery.trim();
    const timeoutId = setTimeout(() => {
      if (isEmpty) {
        setFavSearchResults([]);
        setSearchingFav(false);
        return;
      }
      void handleFavSearch(favSearchQueryRef.current);
    }, isEmpty ? 0 : 200);

    return () => { clearTimeout(timeoutId); };
  // handleFavSearch reads the live query through a ref, so it is deliberately
  // not a dependency — including it would restart the debounce on every keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favSearchQuery, favSongModalVisible]);

  const saveFavoriteSong = async (song: FavoriteSong) => {
    if (!user) return;
    setFavSongModalVisible(false); setFavSearchQuery(''); setFavSearchResults([]);
    try { await supabase.from('users').update({ favorite_song: song }).eq('id', user.id); await refreshUser(); }
    catch { toast.show({ kind: 'error', message: 'Could not save your favorite song' }); }
  };

  const clearFavoriteSong = async () => {
    if (!user) return;
    try { await supabase.from('users').update({ favorite_song: null }).eq('id', user.id); await refreshUser(); }
    catch { toast.show({ kind: 'error', message: 'Could not remove your favorite song' }); }
  };

  const openPinnedPicker = async () => {
    setPinnedPickerVisible(true);
    if (libraryPlaylists.length > 0) return;
    if (!user) return;
    setLoadingLibrary(true);
    try {
      const lists: LibraryPlaylist[] = [];
      if (user.spotify_access_token) lists.push(...await Spotify.getUserPlaylists(user.id));
      if (user.apple_music_user_token) lists.push(...await AppleMusic.getUserPlaylists(user.id));
      if (user.youtube_access_token) lists.push(...await YouTubeMusic.getUserPlaylists(user.id));
      setLibraryPlaylists(lists);
    } finally { setLoadingLibrary(false); }
  };

  const handleShareProfile = async () => {
    if (!user) return;
    try {
      await Share.share({
        message: `Follow ${user.display_name} on Museaic: museaic://profile/${user.username}`,
      });
    } catch {
      toast.show({ kind: 'error', message: 'Could not open the share sheet' });
    }
  };

  if (!user) return <View style={styles.loadingScreen}><ActivityIndicator color={colors.accent} /></View>;

  const initials = user.display_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const avatarUri = avatarPreviewUri ?? user.avatar_url;
  const visiblePublicShares = publicShares.slice(0, 8);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App bar */}
      <AppBar
        left={<Text style={styles.username}>@{user.username}</Text>}
        right={
          <>
            <IconBtn name="notifications-outline" label="Activity" onPress={() => router.push('/(tabs)/notifications' as any)} />
            <IconBtn name="paper-plane-outline" label="Send a song" onPress={() => router.push('/(tabs)/friends' as any)} />
            <IconBtn name="settings-outline" label="Settings" onPress={() => router.push('/(tabs)/settings' as any)} />
          </>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>

        {/* ── Avatar + stats ── */}
        <View style={styles.profileTop}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={handleAvatarPress} activeOpacity={0.85}>
            {/* Outer primary ring */}
            <View style={styles.avatarRing}>
              <View style={styles.avatarRingGap}>
                {avatarUri
                  ? <Image source={{ uri: avatarUri }} style={styles.avatar} />
                  : <View style={styles.avatarFallback}><Text style={styles.initials}>{initials}</Text></View>
                }
              </View>
            </View>
            {uploadingAvatar && <View style={styles.avatarOverlay}><ActivityIndicator color={colors.brandInk} size="small" /></View>}
            <View style={styles.avatarEditBadge}><Ionicons name="camera" size={12} color={colors.accentInk} /></View>
          </TouchableOpacity>

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[['Following', followCounts.following], ['Followers', followCounts.followers], ['Shared', sharedCount]].map(([label, val]) => (
              <View key={label as string} style={styles.stat}>
                <Text style={styles.statNum}>{val}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Name + bio ── */}
        <View style={styles.bioBlock}>
          <Text style={styles.displayName}>{user.display_name}</Text>
          {user.bio
            ? <Text style={styles.bio}>{user.bio}</Text>
            : <Text style={styles.bioPlaceholder}>No bio yet</Text>
          }
          {stats.tasteTags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
              {stats.tasteTags.map(t => (
                <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* ── Edit / Share ── */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.editBtn} onPress={() => router.push({ pathname: '/(tabs)/settings' as any, params: { edit: '1' } })} activeOpacity={0.8}>
            <Text style={styles.editBtnText}>Edit profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.editBtn} onPress={handleShareProfile} activeOpacity={0.8}>
            <Text style={styles.editBtnText}>Share profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/(tabs)/settings' as any)} activeOpacity={0.8}>
            <Ionicons name="settings-outline" size={16} color={colors.text2} />
          </TouchableOpacity>
        </View>

        {/* ── Favorite song banner ── */}
        {user.favorite_song && (
          <TouchableOpacity style={styles.favBanner} onPress={() => setFavSongModalVisible(true)} activeOpacity={0.85}>
            <CoverArt uri={user.favorite_song.cover_url} size={56} radius={10} />
            <View style={{ flex: 1 }}>
              <Text style={styles.favBannerLabel}>♥ Favorite song</Text>
              <Text style={styles.favBannerTitle} numberOfLines={1}>{user.favorite_song.title}</Text>
              <Text style={styles.favBannerArtist} numberOfLines={1}>{user.favorite_song.artist}</Text>
            </View>
            <Ionicons name="play" size={24} color={colors.text2} />
          </TouchableOpacity>
        )}
        {!user.favorite_song && (
          <TouchableOpacity style={[styles.favBanner, styles.favBannerEmpty]} onPress={() => setFavSongModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="heart-outline" size={22} color={colors.accent} />
            <Text style={styles.favBannerEmptyText}>Set a favorite song</Text>
          </TouchableOpacity>
        )}

        {/* ── Wrapped stats card ── */}
        {stats.wrappedStats && (
          <View style={styles.wrappedCard}>
            <View style={styles.wrappedCardHeader}>
              <Text style={styles.wrappedCardTitle}>{new Date().getFullYear()} so far</Text>
              <Text style={styles.wrappedCardSub}>{monthWeekLabel()}</Text>
            </View>
            <View style={styles.wrappedGrid}>
              {[
                { k: 'top track', v: stats.wrappedStats.topTrackTitle ?? '—' },
                { k: 'top genre', v: stats.wrappedStats.topGenre ?? '—' },
                { k: 'saved', v: String(stats.wrappedStats.savedCount) },
                { k: 'playlists', v: String(stats.wrappedStats.playlistCount) },
              ].map(({ k, v }) => (
                <View key={k} style={styles.wrappedStat}>
                  <Text style={styles.wrappedStatLabel}>{k}</Text>
                  <Text style={styles.wrappedStatValue} numberOfLines={1}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Pinned playlists ── */}
        {stats.pinnedPlaylists.length > 0 && (
          <>
            <SectionTitle title="Pinned playlists" right={
              <TouchableOpacity onPress={openPinnedPicker}><Text style={styles.rightAction}>Edit</Text></TouchableOpacity>
            } />
            <View style={styles.pinnedGrid}>
              {stats.pinnedPlaylists.map(pl => (
                <View key={pl.id} style={styles.pinnedItem}>
                  <CoverArt uri={pl.coverUrl} size={96} radius={10} />
                  <Text style={styles.pinnedTitle} numberOfLines={2}>{pl.name}</Text>
                  <Text style={styles.pinnedMeta}>{pl.trackCount} tracks</Text>
                </View>
              ))}
            </View>
          </>
        )}
        {stats.pinnedPlaylists.length === 0 && (
          <>
            <SectionTitle title="Pinned playlists" right={
              <TouchableOpacity onPress={openPinnedPicker}><Text style={styles.rightAction}>+ Add</Text></TouchableOpacity>
            } />
            <EmptyState
              compact
              icon="bookmark-outline"
              title="Nothing pinned yet"
              body="Pin up to three playlists to show at the top of your profile."
              action={{ label: 'Pin a playlist', icon: 'add', onPress: openPinnedPicker }}
            />
          </>
        )}

        {/* ── Public shares section ── */}
        <View style={styles.publicSharesHeader}>
          <View style={styles.publicSharesPlayBtn}>
            <Ionicons name="play" size={16} color={colors.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.publicSharesTitle}>Public shares</Text>
            <Text style={styles.publicSharesSub}>Songs {user.display_name.split(' ')[0]} has shared · {sharedCount}</Text>
          </View>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.text3} />
        </View>

        <View style={styles.publicSharesList}>
          {loadingPublic
            ? <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
            : visiblePublicShares.map((item, i) => (
              <View key={item.id} style={[styles.shareRow, i < visiblePublicShares.length - 1 && styles.shareRowSep]}>
                <CoverArt uri={item.cover_image_url} size={48} radius={8} />
                <View style={styles.shareRowInfo}>
                  <Text style={styles.shareRowTitle} numberOfLines={1}>{item.title}</Text>
                  <View style={styles.shareRowMeta}>
                    {item.sender?.primary_service && <ServiceDot service={item.sender.primary_service} size={8} />}
                    <Text style={styles.shareRowArtist} numberOfLines={1}>{item.artist}</Text>
                  </View>
                </View>
                <Text style={styles.shareRowTime}>{timeAgo(item.created_at)}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.text3} />
              </View>
            ))
          }
          {!loadingPublic && publicShares.length === 0 && (
            <View style={styles.emptyPublic}>
              <Text style={styles.emptyPublicText}>No public shares yet</Text>
            </View>
          )}
        </View>

        {/* ── Listening history toggle ── */}
        {!!user.spotify_access_token && (
          <SectionTitle title="Listening History" right={
            <Switch value={stats.historyOptIn} onValueChange={stats.setHistoryOptIn} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.brandInk} />
          } />
        )}

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Pinned playlist picker ── */}
      <Modal visible={pinnedPickerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPinnedPickerVisible(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pin a Playlist</Text>
            <TouchableOpacity onPress={() => setPinnedPickerVisible(false)}><Ionicons name="close" size={22} color={colors.text3} /></TouchableOpacity>
          </View>
          {loadingLibrary ? <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} /> : (
            <ScrollView>
              {libraryPlaylists.filter(pl => !stats.pinnedPlaylists.find(p => p.id === pl.id)).map(pl => (
                <TouchableOpacity key={pl.id} style={styles.modalRow} onPress={() => { stats.pinPlaylist(pl); setPinnedPickerVisible(false); }} activeOpacity={0.8}>
                  <CoverArt uri={pl.coverUrl} size={48} radius={8} />
                  <View style={styles.modalRowInfo}>
                    <Text style={styles.modalRowTitle} numberOfLines={1}>{pl.name}</Text>
                    <Text style={styles.modalRowMeta}>{pl.trackCount} tracks · <Text style={{ color: serviceColor(colors, pl.service) }}>{serviceLabel(pl.service)}</Text></Text>
                  </View>
                </TouchableOpacity>
              ))}
              {libraryPlaylists.length === 0 && <Text style={styles.modalEmpty}>No playlists found. Connect a service first.</Text>}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Favorite song modal ── */}
      <Modal visible={favSongModalVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setFavSongModalVisible(false); setFavSearchQuery(''); setFavSearchResults([]); }}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Favorite Song</Text>
            <TouchableOpacity onPress={() => { setFavSongModalVisible(false); setFavSearchQuery(''); setFavSearchResults([]); }}>
              <Ionicons name="close" size={22} color={colors.text3} />
            </TouchableOpacity>
          </View>
          <View style={styles.favSearchRow}>
            <View style={styles.favSearchInput}>
              <TextInput
                style={{ flex: 1, color: colors.text, fontSize: 15 }}
                placeholder="Search for a song…"
                placeholderTextColor={colors.text4}
                value={favSearchQuery}
                onChangeText={setFavSearchQuery}
                onSubmitEditing={() => void handleFavSearch()}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity style={styles.favSearchBtn} onPress={() => void handleFavSearch()} disabled={searchingFav}>
              {searchingFav ? <ActivityIndicator color={colors.accentInk} size="small" /> : <Text style={styles.favSearchBtnText}>Search</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView>
            {favSearchResults.map((song, i) => (
              <TouchableOpacity key={`${song.service_id}-${i}`} style={styles.modalRow} onPress={() => saveFavoriteSong(song)} activeOpacity={0.8}>
                <CoverArt uri={song.cover_url} size={48} radius={8} />
                <View style={styles.modalRowInfo}>
                  <Text style={styles.modalRowTitle} numberOfLines={1}>{song.title}</Text>
                  <Text style={styles.modalRowMeta} numberOfLines={1}>{song.artist}</Text>
                </View>
                <View style={[styles.svcDot, { backgroundColor: serviceColor(colors, song.service) }]} />
              </TouchableOpacity>
            ))}
            {user.favorite_song && (
              <TouchableOpacity style={styles.clearFavBtn} onPress={clearFavoriteSong}>
                <Text style={styles.clearFavText}>Remove favorite song</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  username: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },

  // Profile top
  profileTop: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, gap: 20,
  },
  avatarWrapper: { position: 'relative' },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.accent,
    padding: 2, alignItems: 'center', justifyContent: 'center',
  },
  avatarRingGap: {
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: colors.bg, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 28, fontWeight: '700', color: colors.text },
  avatarOverlay: { ...StyleSheet.absoluteFill, borderRadius: 48, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  avatarEditBadge: {
    position: 'absolute', right: 2, bottom: 2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: colors.text3 },

  // Bio block
  bioBlock: { paddingHorizontal: 20, paddingBottom: 12 },
  displayName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 },
  bio: { fontSize: 13, color: colors.text2, lineHeight: 18, marginBottom: 8 },
  bioPlaceholder: { fontSize: 13, color: colors.text4, fontStyle: 'italic', marginBottom: 8 },
  tagRow: { gap: 6 },
  tag: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.line },
  tagText: { fontSize: 11, color: colors.text3, fontWeight: '600' },

  svcDot: { width: 8, height: 8, borderRadius: 4 },

  // Edit / share buttons
  actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  editBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  editBtnText: { fontSize: 13, fontWeight: '600', color: colors.text },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  // Favorite song
  favBanner: {
    marginHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  favBannerEmpty: { justifyContent: 'center', borderStyle: 'dashed', gap: 8 },
  favBannerLabel: { fontSize: 10, color: colors.danger, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  favBannerTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  favBannerArtist: { fontSize: 12, color: colors.text2, marginTop: 1 },
  favBannerEmptyText: { fontSize: 13, color: colors.text3, fontStyle: 'italic' },

  // Wrapped stats
  wrappedCard: {
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  wrappedCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  wrappedCardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  wrappedCardSub: { fontSize: 11, color: colors.text3, fontVariant: ['tabular-nums'] },
  wrappedGrid: { backgroundColor: colors.bgElev, padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  wrappedStat: { width: '50%', paddingVertical: 8, paddingHorizontal: 4 },
  wrappedStatLabel: { fontSize: 10, color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: 3 },
  wrappedStatValue: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },

  // Pinned playlists
  rightAction: { fontSize: 13, color: colors.text3, fontWeight: '500' },
  pinnedGrid: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16,
  },
  pinnedItem: { flex: 1 },
  pinnedTitle: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 6, lineHeight: 16 },
  pinnedMeta: { fontSize: 10, color: colors.text3, marginTop: 2 },

  // Public shares
  publicSharesHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.line, marginTop: 8,
  },
  publicSharesPlayBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  publicSharesTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  publicSharesSub: { fontSize: 12, color: colors.text3, marginTop: 1 },

  publicSharesList: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  shareRowSep: { borderBottomWidth: 1, borderBottomColor: colors.line },
  shareRowInfo: { flex: 1, minWidth: 0 },
  shareRowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  shareRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  shareRowArtist: { fontSize: 12, color: colors.text3 },
  shareRowTime: { fontSize: 11, color: colors.text3 },
  emptyPublic: { alignItems: 'center', paddingVertical: 24 },
  emptyPublicText: { color: colors.text4, fontSize: 13, fontStyle: 'italic' },

  // Modals
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  modalRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalRowInfo: { flex: 1 },
  modalRowTitle: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 2 },
  modalRowMeta: { fontSize: 12, color: colors.text3 },
  modalEmpty: { color: colors.text4, fontSize: 14, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },

  favSearchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  favSearchInput: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.line },
  favSearchBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  favSearchBtnText: { color: colors.accentInk, fontSize: 14, fontWeight: '700' },
  clearFavBtn: { alignItems: 'center', paddingVertical: 20 },
  clearFavText: { color: colors.danger, fontSize: 14, fontWeight: '600' },
}));
