import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal,
  ScrollView, Share, StyleSheet, Switch, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { useProfileStats } from '../../hooks/useProfileStats';
import { MusicServiceButton } from '../../components/MusicServiceButton';
import { MusicService, LibraryPlaylist, FavoriteSong } from '../../types';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { extractYouTubeTrackInfo } from '../../lib/youtubeMusic';
import { pickAndUploadAvatar } from '../../lib/avatarUpload';
import { supabase } from '../../lib/supabase';
import { Avatar, AppBar, IconBtn, CoverArt, ServiceDot, serviceLabelShort, SectionTitle } from '../../components/ui';
import { colors } from '../../lib/theme';

const SERVICES: MusicService[] = ['spotify', 'apple_music', 'youtube_music'];
const SERVICE_LABELS: Record<MusicService, string> = {
  spotify: 'Spotify', apple_music: 'Apple Music', youtube_music: 'YouTube Music',
};
const SERVICE_COLORS: Record<MusicService, string> = {
  spotify: '#1DB954', apple_music: '#fc3c44', youtube_music: '#FF0000',
};
const GENRE_TAGS = ['neo-soul', 'shoegaze', 'r&b', 'jazz', 'bedroom-pop'];

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Invalid date';
  const now = Date.now();
  if (t > now) return 'just now';
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString();
}

export default function Profile() {
  const { user, signOut, setPrimaryService, refreshUser } = useAuth();
  const router = useRouter();
  const { following, followers, getFollowCounts } = useFollows();
  const stats = useProfileStats();

  const [loadingService, setLoadingService] = useState<MusicService | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
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
    getFollowCounts(user.id).then(setFollowCounts).catch(() => {});
    void (async () => {
      try {
        const { count } = await supabase.from('shared_items').select('id', { count: 'exact', head: true }).eq('sender_id', user.id);
        setSharedCount(count ?? 0);
      } catch {}
    })();
    // Load public shares
    setLoadingPublic(true);
    void (async () => {
      try {
        const { data } = await supabase
          .from('shared_items')
          .select('*, sender:users!shared_items_sender_id_fkey(id, username, display_name, avatar_url, primary_service)')
          .eq('sender_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20);
        setPublicShares(data ?? []);
      } catch {} finally { setLoadingPublic(false); }
    })();
  }, [user, getFollowCounts]);

  useEffect(() => {
    setFollowCounts({ followers: followers.length, following: following.length });
  }, [followers.length, following.length]);

  useEffect(() => {
    setAvatarPreviewUri(null);
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
    catch { Alert.alert('Error', 'Could not update photo'); }
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
    if (!favSearchQuery.trim()) {
      setFavSearchResults([]);
      setSearchingFav(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      void handleFavSearch(favSearchQueryRef.current);
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [favSearchQuery, favSongModalVisible]);

  const saveFavoriteSong = async (song: FavoriteSong) => {
    if (!user) return;
    setFavSongModalVisible(false); setFavSearchQuery(''); setFavSearchResults([]);
    try { await supabase.from('users').update({ favorite_song: song }).eq('id', user.id); await refreshUser(); }
    catch { Alert.alert('Error', 'Could not save'); }
  };

  const clearFavoriteSong = async () => {
    if (!user) return;
    try { await supabase.from('users').update({ favorite_song: null }).eq('id', user.id); await refreshUser(); }
    catch { Alert.alert('Error', 'Could not remove'); }
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

  const isConnected = (svc: MusicService) => {
    switch (svc) {
      case 'spotify': return !!user?.spotify_access_token;
      case 'apple_music': return !!user?.apple_music_user_token;
      case 'youtube_music': return !!user?.youtube_access_token;
    }
  };

  const handleConnect = async (svc: MusicService) => {
    if (!user) return;
    setLoadingService(svc);
    try {
      let ok = false;
      switch (svc) {
        case 'spotify': ok = await Spotify.connectSpotify(user.id); break;
        case 'apple_music': ok = await AppleMusic.connectAppleMusic(user.id); break;
        case 'youtube_music': ok = await YouTubeMusic.connectYouTubeMusic(user.id); break;
      }
      if (ok) { await refreshUser(); Alert.alert('Connected!', `${SERVICE_LABELS[svc]} connected.`); }
      else Alert.alert('Failed', `Could not connect ${SERVICE_LABELS[svc]}.`);
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed'); }
    finally { setLoadingService(null); }
  };

  const handleDisconnect = (svc: MusicService) => {
    const userId = user?.id;
    if (!userId) return;
    Alert.alert(`Disconnect ${SERVICE_LABELS[svc]}?`, 'You can reconnect anytime.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => {
        setLoadingService(svc);
        try {
          switch (svc) {
            case 'spotify': await Spotify.disconnectSpotify(userId); break;
            case 'apple_music': await AppleMusic.disconnectAppleMusic(userId); break;
            case 'youtube_music': await YouTubeMusic.disconnectYouTubeMusic(userId); break;
          }
          await refreshUser();
        } finally { setLoadingService(null); }
      }},
    ]);
  };

  const handleSetPrimary = async (svc: MusicService) => {
    if (!user || user.primary_service === svc) return;
    try { await setPrimaryService(svc); }
    catch { Alert.alert('Error', 'Could not update primary service'); }
  };

  const handleConnectMissingService = () => {
    const missing = SERVICES.filter(svc => !isConnected(svc));
    if (missing.length === 0) return;
    if (missing.length === 1) {
      void handleConnect(missing[0]);
      return;
    }

    Alert.alert(
      'Connect a service',
      'Choose a streaming service to connect.',
      [
        ...missing.map(svc => ({ text: SERVICE_LABELS[svc], onPress: () => void handleConnect(svc) })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleShareProfile = async () => {
    if (!user) return;
    try {
      await Share.share({
        message: `Follow ${user.display_name} on MusicBridge: musicbridge://profile/${user.username}`,
      });
    } catch {
      Alert.alert('Share unavailable', 'Could not open the system share sheet.');
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
        setSigningOut(true);
        try { await signOut(); } finally { setSigningOut(false); }
      }},
    ]);
  };

  if (!user) return <View style={styles.loadingScreen}><ActivityIndicator color={colors.primary} /></View>;

  const initials = user.display_name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const primarySvc = user.primary_service as MusicService | null;
  const avatarUri = avatarPreviewUri ?? user.avatar_url;
  const visiblePublicShares = publicShares.slice(0, 8);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App bar */}
      <AppBar
        left={<Text style={styles.username}>@{user.username}</Text>}
        right={
          <>
            <IconBtn name="notifications-outline" onPress={() => router.push('/(tabs)/notifications' as any)} />
            <IconBtn name="paper-plane-outline" onPress={() => router.push('/(tabs)/friends' as any)} />
            <IconBtn name="settings-outline" onPress={() => router.push('/(tabs)/settings' as any)} />
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
            {uploadingAvatar && <View style={styles.avatarOverlay}><ActivityIndicator color="#fff" size="small" /></View>}
            <View style={styles.avatarEditBadge}><Ionicons name="camera" size={12} color="#fff" /></View>
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
          {/* Genre chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
            {GENRE_TAGS.map(t => (
              <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
            ))}
          </ScrollView>
        </View>

        {/* ── Connected services chips ── */}
        <View style={styles.svcRow}>
          {SERVICES.filter(isConnected).map(svc => (
            <TouchableOpacity
              key={svc}
              style={[styles.svcChip, primarySvc === svc && styles.svcChipPrimary]}
              onPress={() => handleSetPrimary(svc)}
              activeOpacity={0.8}
            >
              <View style={[styles.svcDot, { backgroundColor: SERVICE_COLORS[svc] }]} />
              <Text style={styles.svcChipText}>
                {svc === 'spotify' ? 'Spotify' : svc === 'apple_music' ? 'Apple' : 'YT Music'}
              </Text>
              {primarySvc === svc && <Text style={styles.svcPrimaryBadge}>Primary</Text>}
            </TouchableOpacity>
          ))}
          {SERVICES.some(s => !isConnected(s)) && (
            <TouchableOpacity style={styles.svcChipAdd} onPress={handleConnectMissingService} activeOpacity={0.8}>
              <Ionicons name="add" size={14} color={colors.fg3} />
              <Text style={styles.svcChipAddText}>Connect</Text>
            </TouchableOpacity>
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
            <Ionicons name="settings-outline" size={16} color={colors.fg2} />
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
            <Ionicons name="play" size={24} color={colors.fg2} />
          </TouchableOpacity>
        )}
        {!user.favorite_song && (
          <TouchableOpacity style={[styles.favBanner, styles.favBannerEmpty]} onPress={() => setFavSongModalVisible(true)} activeOpacity={0.8}>
            <Ionicons name="heart-outline" size={22} color={colors.primary} />
            <Text style={styles.favBannerEmptyText}>Set a favorite song</Text>
          </TouchableOpacity>
        )}

        {/* ── Wrapped stats card ── */}
        {stats.wrappedStats && (
          <View style={styles.wrappedCard}>
            <View style={styles.wrappedCardHeader}>
              <Text style={styles.wrappedCardTitle}>2026 so far</Text>
              <Text style={styles.wrappedCardSub}>APR · WK 17</Text>
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
          <SectionTitle title="Pinned playlists" right={
            <TouchableOpacity onPress={openPinnedPicker}><Text style={styles.rightAction}>+ Add</Text></TouchableOpacity>
          } />
        )}

        {/* ── Public shares section ── */}
        <View style={styles.publicSharesHeader}>
          <View style={styles.publicSharesPlayBtn}>
            <Ionicons name="play" size={16} color={colors.primaryInk} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.publicSharesTitle}>Public shares</Text>
            <Text style={styles.publicSharesSub}>Songs {user.display_name.split(' ')[0]} has shared · {sharedCount}</Text>
          </View>
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.fg3} />
        </View>

        <View style={styles.publicSharesList}>
          {loadingPublic
            ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
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
                <Ionicons name="chevron-forward" size={16} color={colors.fg3} />
              </View>
            ))
          }
          {!loadingPublic && publicShares.length === 0 && (
            <View style={styles.emptyPublic}>
              <Text style={styles.emptyPublicText}>No public shares yet</Text>
            </View>
          )}
        </View>

        {/* ── Streaming services ── */}
        <SectionTitle title="Streaming Services" />
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.serviceSubtitle}>Connect your services so friends can share music you can play.</Text>
          {SERVICES.map(svc => (
            <View key={svc}>
              <MusicServiceButton
                service={svc}
                connected={isConnected(svc)}
                onConnect={() => handleConnect(svc)}
                onDisconnect={() => handleDisconnect(svc)}
                loading={loadingService === svc}
                isPrimary={primarySvc === svc}
              />
              {isConnected(svc) && primarySvc !== svc && (
                <TouchableOpacity style={styles.setPrimaryRow} onPress={() => handleSetPrimary(svc)}>
                  <Text style={styles.setPrimaryText}>Set as primary</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {primarySvc && (
            <View style={styles.primaryInfo}>
              <View style={[styles.primaryDot, { backgroundColor: SERVICE_COLORS[primarySvc] }]} />
              <Text style={styles.primaryInfoText}>Songs open in <Text style={styles.primaryInfoHighlight}>{SERVICE_LABELS[primarySvc]}</Text></Text>
            </View>
          )}
        </View>

        {/* ── Listening history toggle ── */}
        {!!user.spotify_access_token && (
          <SectionTitle title="Listening History" right={
            <Switch value={stats.historyOptIn} onValueChange={stats.setHistoryOptIn} trackColor={{ false: colors.line2, true: colors.primary }} thumbColor="#fff" />
          } />
        )}

        {/* ── Sign out ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut} disabled={signingOut} activeOpacity={0.8}>
            {signingOut ? <ActivityIndicator color={colors.coral} size="small" /> : <Text style={styles.signOutText}>Sign Out</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Pinned playlist picker ── */}
      <Modal visible={pinnedPickerVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPinnedPickerVisible(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Pin a Playlist</Text>
            <TouchableOpacity onPress={() => setPinnedPickerVisible(false)}><Ionicons name="close" size={22} color={colors.fg3} /></TouchableOpacity>
          </View>
          {loadingLibrary ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
            <ScrollView>
              {libraryPlaylists.filter(pl => !stats.pinnedPlaylists.find(p => p.id === pl.id)).map(pl => (
                <TouchableOpacity key={pl.id} style={styles.modalRow} onPress={() => { stats.pinPlaylist(pl); setPinnedPickerVisible(false); }} activeOpacity={0.8}>
                  <CoverArt uri={pl.coverUrl} size={48} radius={8} />
                  <View style={styles.modalRowInfo}>
                    <Text style={styles.modalRowTitle} numberOfLines={1}>{pl.name}</Text>
                    <Text style={styles.modalRowMeta}>{pl.trackCount} tracks · <Text style={{ color: SERVICE_COLORS[pl.service] }}>{SERVICE_LABELS[pl.service]}</Text></Text>
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
              <Ionicons name="close" size={22} color={colors.fg3} />
            </TouchableOpacity>
          </View>
          <View style={styles.favSearchRow}>
            <View style={styles.favSearchInput}>
              <TextInput
                style={{ flex: 1, color: colors.fg, fontSize: 15 }}
                placeholder="Search for a song…"
                placeholderTextColor={colors.fg4}
                value={favSearchQuery}
                onChangeText={setFavSearchQuery}
                onSubmitEditing={() => void handleFavSearch()}
                returnKeyType="search"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <TouchableOpacity style={styles.favSearchBtn} onPress={() => void handleFavSearch()} disabled={searchingFav}>
              {searchingFav ? <ActivityIndicator color={colors.primaryInk} size="small" /> : <Text style={styles.favSearchBtnText}>Search</Text>}
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
                <View style={[styles.svcDot, { backgroundColor: SERVICE_COLORS[song.service] }]} />
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
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },

  username: { fontSize: 18, fontWeight: '700', color: colors.fg, letterSpacing: -0.3 },

  // Profile top
  profileTop: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16, gap: 20,
  },
  avatarWrapper: { position: 'relative' },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.primary,
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
    backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center',
  },
  initials: { fontSize: 28, fontWeight: '700', color: colors.fg },
  avatarOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 48, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  avatarEditBadge: {
    position: 'absolute', right: 2, bottom: 2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  statsRow: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '800', color: colors.fg, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: colors.fg3 },

  // Bio block
  bioBlock: { paddingHorizontal: 20, paddingBottom: 12 },
  displayName: { fontSize: 16, fontWeight: '700', color: colors.fg, marginBottom: 4 },
  bio: { fontSize: 13, color: colors.fg2, lineHeight: 18, marginBottom: 8 },
  bioPlaceholder: { fontSize: 13, color: colors.fg4, fontStyle: 'italic', marginBottom: 8 },
  tagRow: { gap: 6 },
  tag: { backgroundColor: colors.bgCard, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: colors.line },
  tagText: { fontSize: 11, color: colors.fg3, fontWeight: '600' },

  // Service chips
  svcRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12, flexWrap: 'wrap' },
  svcChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.bgCard, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.line },
  svcChipPrimary: { borderColor: colors.primary },
  svcDot: { width: 8, height: 8, borderRadius: 4 },
  svcChipText: { fontSize: 12, color: colors.fg2, fontWeight: '600' },
  svcPrimaryBadge: { fontSize: 10, color: colors.primary, fontWeight: '700' },
  svcChipAdd: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  svcChipAddText: { fontSize: 12, color: colors.fg3 },

  // Edit / share buttons
  actionRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 16 },
  editBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  editBtnText: { fontSize: 13, fontWeight: '600', color: colors.fg },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },

  // Favorite song
  favBanner: {
    marginHorizontal: 16, marginBottom: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  favBannerEmpty: { justifyContent: 'center', borderStyle: 'dashed', gap: 8 },
  favBannerLabel: { fontSize: 10, color: colors.coral, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  favBannerTitle: { fontSize: 15, fontWeight: '700', color: colors.fg },
  favBannerArtist: { fontSize: 12, color: colors.fg2, marginTop: 1 },
  favBannerEmptyText: { fontSize: 13, color: colors.fg3, fontStyle: 'italic' },

  // Wrapped stats
  wrappedCard: {
    marginHorizontal: 16, marginBottom: 16,
    borderRadius: 16, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  wrappedCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.bgCard,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  wrappedCardTitle: { fontSize: 16, fontWeight: '700', color: colors.fg },
  wrappedCardSub: { fontSize: 11, color: colors.fg3, fontVariant: ['tabular-nums'] },
  wrappedGrid: { backgroundColor: colors.bgElev, padding: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  wrappedStat: { width: '50%', paddingVertical: 8, paddingHorizontal: 4 },
  wrappedStatLabel: { fontSize: 10, color: colors.fg3, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600', marginBottom: 3 },
  wrappedStatValue: { fontSize: 16, fontWeight: '700', color: colors.fg, letterSpacing: -0.3 },

  // Pinned playlists
  rightAction: { fontSize: 13, color: colors.fg3, fontWeight: '500' },
  pinnedGrid: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 16,
  },
  pinnedItem: { flex: 1 },
  pinnedTitle: { fontSize: 12, fontWeight: '600', color: colors.fg, marginTop: 6, lineHeight: 16 },
  pinnedMeta: { fontSize: 10, color: colors.fg3, marginTop: 2 },

  // Public shares
  publicSharesHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: colors.line, marginTop: 8,
  },
  publicSharesPlayBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  publicSharesTitle: { fontSize: 16, fontWeight: '700', color: colors.fg },
  publicSharesSub: { fontSize: 12, color: colors.fg3, marginTop: 1 },

  publicSharesList: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  shareRowSep: { borderBottomWidth: 1, borderBottomColor: colors.line },
  shareRowInfo: { flex: 1, minWidth: 0 },
  shareRowTitle: { fontSize: 14, fontWeight: '600', color: colors.fg },
  shareRowMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  shareRowArtist: { fontSize: 12, color: colors.fg3 },
  shareRowTime: { fontSize: 11, color: colors.fg3 },
  emptyPublic: { alignItems: 'center', paddingVertical: 24 },
  emptyPublicText: { color: colors.fg4, fontSize: 13, fontStyle: 'italic' },

  // Service section
  serviceSubtitle: { color: colors.fg3, fontSize: 13, lineHeight: 18, marginBottom: 14, marginTop: -4 },
  setPrimaryRow: { alignSelf: 'flex-end', marginTop: -8, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 4 },
  setPrimaryText: { color: colors.fg3, fontSize: 12, textDecorationLine: 'underline' },
  primaryInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  primaryDot: { width: 8, height: 8, borderRadius: 4 },
  primaryInfoText: { color: colors.fg3, fontSize: 13 },
  primaryInfoHighlight: { color: colors.fg2, fontWeight: '600' },

  // Sign out
  signOutBtn: { backgroundColor: colors.bgCard, borderRadius: 12, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  signOutText: { color: colors.coral, fontSize: 16, fontWeight: '600' },

  // Modals
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.fg },
  modalRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  modalRowInfo: { flex: 1 },
  modalRowTitle: { fontSize: 15, fontWeight: '600', color: colors.fg, marginBottom: 2 },
  modalRowMeta: { fontSize: 12, color: colors.fg3 },
  modalEmpty: { color: colors.fg4, fontSize: 14, textAlign: 'center', marginTop: 48, paddingHorizontal: 32 },

  favSearchRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  favSearchInput: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: colors.line },
  favSearchBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  favSearchBtnText: { color: colors.primaryInk, fontSize: 14, fontWeight: '700' },
  clearFavBtn: { alignItems: 'center', paddingVertical: 20 },
  clearFavText: { color: colors.coral, fontSize: 14, fontWeight: '600' },
});
