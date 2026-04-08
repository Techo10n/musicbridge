import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { useProfileStats } from '../../hooks/useProfileStats';
import { MusicServiceButton } from '../../components/MusicServiceButton';
import { MusicService, LibraryPlaylist, FavoriteSong } from '../../types';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { pickAndUploadAvatar } from '../../lib/avatarUpload';
import { supabase } from '../../lib/supabase';

const SERVICES: MusicService[] = ['spotify', 'apple_music', 'youtube_music'];
const SERVICE_LABELS: Record<MusicService, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
};
const SERVICE_COLORS: Record<MusicService, string> = {
  spotify: '#1DB954',
  apple_music: '#fc3c44',
  youtube_music: '#FF0000',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={statStyles.pill}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  pill: { alignItems: 'center', minWidth: 64 },
  value: { color: '#fff', fontSize: 18, fontWeight: '800' },
  label: { color: '#666', fontSize: 12, marginTop: 2 },
});

function TasteTag({ label }: { label: string }) {
  return (
    <View style={tagStyles.tag}>
      <Text style={tagStyles.text}>{label}</Text>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  tag: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  text: { color: '#aaa', fontSize: 12, fontWeight: '600' },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function Profile() {
  const { user, signOut, setPrimaryService, refreshUser } = useAuth();
  const { following, followers, getFollowCounts } = useFollows();
  const stats = useProfileStats();

  const [loadingService, setLoadingService] = useState<MusicService | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Inline edit state
  const [editingBio, setEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState('');

  // Follower/following counts (fetched once)
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [sharedCount, setSharedCount] = useState(0);

  // Pinned playlist picker modal
  const [pinnedPickerVisible, setPinnedPickerVisible] = useState(false);
  const [libraryPlaylists, setLibraryPlaylists] = useState<LibraryPlaylist[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // Favorite song modal
  const [favSongModalVisible, setFavSongModalVisible] = useState(false);
  const [favSearchQuery, setFavSearchQuery] = useState('');
  const [favSearchResults, setFavSearchResults] = useState<FavoriteSong[]>([]);
  const [searchingFav, setSearchingFav] = useState(false);

  // ─── Load counts ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return;
    getFollowCounts(user.id).then(setFollowCounts).catch(() => {});

    // Count items this user has shared
    supabase
      .from('shared_items')
      .select('id', { count: 'exact', head: true })
      .eq('sender_id', user.id)
      .then(({ count }) => setSharedCount(count ?? 0))
      .catch(() => {});
  }, [user, getFollowCounts]);

  // Keep counts in sync with follow changes
  useEffect(() => {
    setFollowCounts({ followers: followers.length, following: following.length });
  }, [followers.length, following.length]);

  // ─── Avatar upload ────────────────────────────────────────────────────────

  const handleAvatarPress = async () => {
    if (!user || uploadingAvatar) return;
    setUploadingAvatar(true);
    try {
      const url = await pickAndUploadAvatar(user.id);
      if (url) await refreshUser();
    } catch {
      Alert.alert('Error', 'Could not update profile photo');
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ─── Bio editing ──────────────────────────────────────────────────────────

  const startEditingBio = () => {
    setBioDraft(user?.bio ?? '');
    setEditingBio(true);
  };

  const saveBio = async () => {
    if (!user) return;
    setEditingBio(false);
    try {
      await supabase
        .from('users')
        .update({ bio: bioDraft.trim() || null })
        .eq('id', user.id);
      await refreshUser();
    } catch {
      Alert.alert('Error', 'Could not save bio');
    }
  };

  // ─── Favorite song ────────────────────────────────────────────────────────

  const handleFavSearch = useCallback(async () => {
    if (!user || !favSearchQuery.trim()) return;
    setSearchingFav(true);
    try {
      const results: FavoriteSong[] = [];

      if (user.spotify_access_token) {
        const tracks = await Spotify.searchTracks(user.id, favSearchQuery.trim());
        for (const t of tracks.slice(0, 5)) {
          results.push({
            title: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            service: 'spotify',
            service_id: t.id,
            cover_url: t.album.images[0]?.url ?? '',
          });
        }
      }

      if (user.youtube_access_token) {
        const tracks = await YouTubeMusic.searchTracks(user.id, favSearchQuery.trim());
        for (const t of tracks.slice(0, 3)) {
          results.push({
            title: t.snippet.title,
            artist: t.snippet.channelTitle.replace(' - Topic', ''),
            service: 'youtube_music',
            service_id: t.id.videoId,
            cover_url: t.snippet.thumbnails.medium?.url ?? '',
          });
        }
      }

      setFavSearchResults(results);
    } finally {
      setSearchingFav(false);
    }
  }, [user, favSearchQuery]);

  const saveFavoriteSong = async (song: FavoriteSong) => {
    if (!user) return;
    setFavSongModalVisible(false);
    setFavSearchQuery('');
    setFavSearchResults([]);
    try {
      await supabase
        .from('users')
        .update({ favorite_song: song })
        .eq('id', user.id);
      await refreshUser();
    } catch {
      Alert.alert('Error', 'Could not save favorite song');
    }
  };

  // ─── Pinned playlists ─────────────────────────────────────────────────────

  const openPinnedPicker = async () => {
    setPinnedPickerVisible(true);
    if (libraryPlaylists.length > 0) return;
    if (!user) return;
    setLoadingLibrary(true);
    try {
      const playlists: LibraryPlaylist[] = [];
      if (user.spotify_access_token) {
        const sp = await Spotify.getUserPlaylists(user.id);
        playlists.push(...sp);
      }
      if (user.youtube_access_token) {
        const yt = await YouTubeMusic.getUserPlaylists(user.id);
        playlists.push(...yt);
      }
      setLibraryPlaylists(playlists);
    } finally {
      setLoadingLibrary(false);
    }
  };

  // ─── Music service connect/disconnect ────────────────────────────────────

  const isConnected = (service: MusicService): boolean => {
    switch (service) {
      case 'spotify': return !!user?.spotify_access_token;
      case 'apple_music': return !!user?.apple_music_user_token;
      case 'youtube_music': return !!user?.youtube_access_token;
    }
  };

  const handleConnect = async (service: MusicService) => {
    if (!user) return;
    setLoadingService(service);
    try {
      let success = false;
      switch (service) {
        case 'spotify': success = await Spotify.connectSpotify(user.id); break;
        case 'apple_music': success = await AppleMusic.connectAppleMusic(user.id); break;
        case 'youtube_music': success = await YouTubeMusic.connectYouTubeMusic(user.id); break;
      }
      if (success) {
        await refreshUser();
        Alert.alert('Connected!', `${SERVICE_LABELS[service]} connected successfully.`);
      } else {
        Alert.alert('Failed', `Could not connect ${SERVICE_LABELS[service]}.`);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoadingService(null);
    }
  };

  const handleDisconnect = async (service: MusicService) => {
    if (!user) return;
    Alert.alert(
      `Disconnect ${SERVICE_LABELS[service]}?`,
      'You can reconnect at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setLoadingService(service);
            try {
              switch (service) {
                case 'spotify': await Spotify.disconnectSpotify(user.id); break;
                case 'apple_music': await AppleMusic.disconnectAppleMusic(user.id); break;
                case 'youtube_music': await YouTubeMusic.disconnectYouTubeMusic(user.id); break;
              }
              await refreshUser();
            } finally {
              setLoadingService(null);
            }
          },
        },
      ],
    );
  };

  const handleSetPrimary = async (service: MusicService) => {
    if (!user || user.primary_service === service) return;
    try {
      await setPrimaryService(service);
    } catch {
      Alert.alert('Error', 'Could not update primary service');
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try { await signOut(); } finally { setSigningOut(false); }
        },
      },
    ]);
  };

  if (!user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const initials = user.display_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const hasSpotify = !!user.spotify_access_token;
  const hasYouTube = !!user.youtube_access_token;
  const hasAnyService = hasSpotify || hasYouTube || !!user.apple_music_user_token;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Avatar + name + username ────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.avatarWrapper}
            onPress={handleAvatarPress}
            activeOpacity={0.8}
          >
            {user.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" size="small" />
              </View>
            )}
            <View style={styles.cameraIcon}>
              <Text style={styles.cameraEmoji}>📷</Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.displayName}>{user.display_name}</Text>
          <Text style={styles.username}>@{user.username}</Text>

          {/* Bio */}
          {editingBio ? (
            <View style={styles.bioEditRow}>
              <TextInput
                style={styles.bioInput}
                value={bioDraft}
                onChangeText={setBioDraft}
                placeholder="Write a bio…"
                placeholderTextColor="#444"
                multiline
                autoFocus
                maxLength={160}
              />
              <View style={styles.bioEditActions}>
                <TouchableOpacity onPress={() => setEditingBio(false)} style={styles.bioCancel}>
                  <Text style={styles.bioCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveBio} style={styles.bioSave}>
                  <Text style={styles.bioSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={startEditingBio} activeOpacity={0.7}>
              <Text style={user.bio ? styles.bio : styles.bioPlaceholder}>
                {user.bio ?? 'Add a bio…'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Followers / Following / Shared stats ────────────────────────── */}
        <View style={styles.statsRow}>
          <StatPill label="Followers" value={followCounts.followers} />
          <View style={styles.statDivider} />
          <StatPill label="Following" value={followCounts.following} />
          <View style={styles.statDivider} />
          <StatPill label="Shared" value={sharedCount} />
        </View>

        {/* ── Favorite song ────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Favorite Song</Text>
          <TouchableOpacity
            style={styles.favSongRow}
            onPress={() => setFavSongModalVisible(true)}
            activeOpacity={0.8}
          >
            {user.favorite_song ? (
              <>
                {user.favorite_song.cover_url ? (
                  <Image
                    source={{ uri: user.favorite_song.cover_url }}
                    style={styles.favCover}
                  />
                ) : (
                  <View style={[styles.favCover, styles.favCoverFallback]}>
                    <Text style={{ fontSize: 18 }}>🎵</Text>
                  </View>
                )}
                <View style={styles.favInfo}>
                  <Text style={styles.favTitle} numberOfLines={1}>
                    {user.favorite_song.title}
                  </Text>
                  <Text style={styles.favArtist} numberOfLines={1}>
                    {user.favorite_song.artist}
                  </Text>
                </View>
                <View
                  style={[
                    styles.serviceDot,
                    { backgroundColor: SERVICE_COLORS[user.favorite_song.service] },
                  ]}
                />
              </>
            ) : (
              <Text style={styles.favPlaceholder}>Tap to set your favorite song</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Taste tags (Spotify only) ────────────────────────────────────── */}
        {stats.tasteTags.length > 0 && (
          <View style={styles.tasteTagsRow}>
            {stats.tasteTags.map((tag) => (
              <TasteTag key={tag} label={tag} />
            ))}
          </View>
        )}

        {/* ── Wrapped stats card ───────────────────────────────────────────── */}
        {stats.wrappedStats && hasAnyService && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Stats</Text>
            <View style={styles.wrappedCard}>
              {stats.wrappedStats.topTrackTitle && (
                <View style={styles.wrappedRow}>
                  <Text style={styles.wrappedLabel}>Top Track</Text>
                  <Text style={styles.wrappedValue} numberOfLines={1}>
                    {stats.wrappedStats.topTrackTitle}
                  </Text>
                </View>
              )}
              {stats.wrappedStats.topGenre && (
                <View style={styles.wrappedRow}>
                  <Text style={styles.wrappedLabel}>Top Genre</Text>
                  <Text style={styles.wrappedValue}>{stats.wrappedStats.topGenre}</Text>
                </View>
              )}
              <View style={styles.wrappedRow}>
                <Text style={styles.wrappedLabel}>Saved Songs</Text>
                <Text style={styles.wrappedValue}>
                  {stats.wrappedStats.savedCount.toLocaleString()}
                </Text>
              </View>
              <View style={[styles.wrappedRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.wrappedLabel}>Playlists</Text>
                <Text style={styles.wrappedValue}>
                  {stats.wrappedStats.playlistCount.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Top Artists ──────────────────────────────────────────────────── */}
        {stats.topArtists.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {hasSpotify ? 'Top Artists' : 'Subscribed Artists'}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {stats.topArtists.map((artist) => (
                <View key={artist.id} style={styles.artistCard}>
                  {artist.imageUrl ? (
                    <Image source={{ uri: artist.imageUrl }} style={styles.artistImage} />
                  ) : (
                    <View style={[styles.artistImage, styles.artistImageFallback]}>
                      <Text style={{ fontSize: 22 }}>🎤</Text>
                    </View>
                  )}
                  <Text style={styles.artistName} numberOfLines={2}>
                    {artist.name}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Top Songs ────────────────────────────────────────────────────── */}
        {stats.topTracks.length > 0 && hasSpotify && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Songs</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
              {stats.topTracks.map((track, i) => (
                <View key={track.id} style={styles.trackCard}>
                  {track.coverUrl ? (
                    <Image source={{ uri: track.coverUrl }} style={styles.trackCover} />
                  ) : (
                    <View style={[styles.trackCover, styles.trackCoverFallback]}>
                      <Text style={{ fontSize: 20 }}>🎵</Text>
                    </View>
                  )}
                  <Text style={styles.trackRank}>#{i + 1}</Text>
                  <Text style={styles.trackTitle} numberOfLines={2}>
                    {track.title}
                  </Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>
                    {track.artist}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Pinned Playlists ─────────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pinned Playlists</Text>
            {stats.pinnedPlaylists.length < 3 && (
              <TouchableOpacity onPress={openPinnedPicker} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {stats.pinnedPlaylists.length === 0 ? (
            <Text style={styles.emptyHint}>Pin up to 3 playlists to highlight on your profile</Text>
          ) : (
            stats.pinnedPlaylists.map((pl) => (
              <View key={pl.id} style={styles.pinnedRow}>
                {pl.coverUrl ? (
                  <Image source={{ uri: pl.coverUrl }} style={styles.pinnedCover} />
                ) : (
                  <View style={[styles.pinnedCover, styles.pinnedCoverFallback]}>
                    <Text style={{ fontSize: 16 }}>🎵</Text>
                  </View>
                )}
                <View style={styles.pinnedInfo}>
                  <Text style={styles.pinnedName} numberOfLines={1}>{pl.name}</Text>
                  <Text style={styles.pinnedMeta}>
                    {pl.trackCount} tracks ·{' '}
                    <Text style={{ color: SERVICE_COLORS[pl.service] }}>
                      {SERVICE_LABELS[pl.service]}
                    </Text>
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => stats.unpinPlaylist(pl.id)}
                  style={styles.unpinButton}
                >
                  <Text style={styles.unpinText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── Listening History (Spotify only) ────────────────────────────── */}
        {hasSpotify && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Listening History</Text>
              <Switch
                value={stats.historyOptIn}
                onValueChange={stats.setHistoryOptIn}
                trackColor={{ false: '#2a2a2a', true: '#1DB954' }}
                thumbColor="#fff"
              />
            </View>
            {stats.historyOptIn && stats.recentTracks.length > 0 && (
              <View style={styles.historyList}>
                {stats.recentTracks.slice(0, 10).map((track, i) => (
                  <View key={`${track.id}-${i}`} style={styles.historyRow}>
                    {track.coverUrl ? (
                      <Image source={{ uri: track.coverUrl }} style={styles.historyCover} />
                    ) : (
                      <View style={[styles.historyCover, styles.historyCoverFallback]}>
                        <Text style={{ fontSize: 14 }}>🎵</Text>
                      </View>
                    )}
                    <View style={styles.historyInfo}>
                      <Text style={styles.historyTitle} numberOfLines={1}>{track.title}</Text>
                      <Text style={styles.historyArtist} numberOfLines={1}>{track.artist}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {stats.historyOptIn && stats.loading && (
              <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
            )}
            {!stats.historyOptIn && (
              <Text style={styles.emptyHint}>Enable to show your recently played tracks</Text>
            )}
          </View>
        )}

        {/* ── Streaming Services ───────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Streaming Services</Text>
          <Text style={styles.sectionSubtitle}>
            Connect your services so friends can share music you can actually play.
          </Text>
          {SERVICES.map((service) => (
            <View key={service}>
              <MusicServiceButton
                service={service}
                connected={isConnected(service)}
                onConnect={() => handleConnect(service)}
                onDisconnect={() => handleDisconnect(service)}
                loading={loadingService === service}
                isPrimary={user.primary_service === service}
              />
              {isConnected(service) && user.primary_service !== service && (
                <TouchableOpacity
                  style={styles.setPrimaryButton}
                  onPress={() => handleSetPrimary(service)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.setPrimaryText}>Set as primary</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
          {user.primary_service && (
            <View style={styles.primaryInfo}>
              <View
                style={[styles.primaryDot, { backgroundColor: SERVICE_COLORS[user.primary_service] }]}
              />
              <Text style={styles.primaryInfoText}>
                Songs open in{' '}
                <Text style={styles.primaryInfoHighlight}>
                  {SERVICE_LABELS[user.primary_service]}
                </Text>
              </Text>
            </View>
          )}
        </View>

        {/* ── Sign Out ─────────────────────────────────────────────────────── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.signOutButton, signingOut && styles.signOutDisabled]}
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.8}
          >
            {signingOut ? (
              <ActivityIndicator color="#ff4444" size="small" />
            ) : (
              <Text style={styles.signOutText}>Sign Out</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>

      {/* ── Pinned Playlist Picker Modal ───────────────────────────────────── */}
      <Modal
        visible={pinnedPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPinnedPickerVisible(false)}
      >
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Pin a Playlist</Text>
            <TouchableOpacity
              onPress={() => setPinnedPickerVisible(false)}
              style={modalStyles.close}
            >
              <Text style={modalStyles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>
          {loadingLibrary ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView>
              {libraryPlaylists
                .filter((pl) => !stats.pinnedPlaylists.find((p) => p.id === pl.id))
                .map((pl) => (
                  <TouchableOpacity
                    key={pl.id}
                    style={modalStyles.row}
                    onPress={() => {
                      stats.pinPlaylist(pl);
                      setPinnedPickerVisible(false);
                    }}
                    activeOpacity={0.8}
                  >
                    {pl.coverUrl ? (
                      <Image source={{ uri: pl.coverUrl }} style={modalStyles.cover} />
                    ) : (
                      <View style={[modalStyles.cover, modalStyles.coverFallback]}>
                        <Text style={{ fontSize: 16 }}>🎵</Text>
                      </View>
                    )}
                    <View style={modalStyles.info}>
                      <Text style={modalStyles.name} numberOfLines={1}>{pl.name}</Text>
                      <Text style={modalStyles.meta}>
                        {pl.trackCount} tracks ·{' '}
                        <Text style={{ color: SERVICE_COLORS[pl.service] }}>
                          {SERVICE_LABELS[pl.service]}
                        </Text>
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              {libraryPlaylists.length === 0 && (
                <Text style={modalStyles.empty}>
                  No playlists found. Connect a streaming service first.
                </Text>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ── Favorite Song Modal ────────────────────────────────────────────── */}
      <Modal
        visible={favSongModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setFavSongModalVisible(false);
          setFavSearchQuery('');
          setFavSearchResults([]);
        }}
      >
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <Text style={modalStyles.title}>Favorite Song</Text>
            <TouchableOpacity
              onPress={() => {
                setFavSongModalVisible(false);
                setFavSearchQuery('');
                setFavSearchResults([]);
              }}
              style={modalStyles.close}
            >
              <Text style={modalStyles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.favSearchRow}>
            <TextInput
              style={styles.favSearchInput}
              placeholder="Search for a song…"
              placeholderTextColor="#555"
              value={favSearchQuery}
              onChangeText={setFavSearchQuery}
              onSubmitEditing={handleFavSearch}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.favSearchButton, searchingFav && styles.favSearchDisabled]}
              onPress={handleFavSearch}
              disabled={searchingFav}
              activeOpacity={0.8}
            >
              {searchingFav ? (
                <ActivityIndicator color="#000" size="small" />
              ) : (
                <Text style={styles.favSearchButtonText}>Search</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView>
            {favSearchResults.map((song, i) => (
              <TouchableOpacity
                key={`${song.service_id}-${i}`}
                style={modalStyles.row}
                onPress={() => saveFavoriteSong(song)}
                activeOpacity={0.8}
              >
                {song.cover_url ? (
                  <Image source={{ uri: song.cover_url }} style={modalStyles.cover} />
                ) : (
                  <View style={[modalStyles.cover, modalStyles.coverFallback]}>
                    <Text style={{ fontSize: 16 }}>🎵</Text>
                  </View>
                )}
                <View style={modalStyles.info}>
                  <Text style={modalStyles.name} numberOfLines={1}>{song.title}</Text>
                  <Text style={modalStyles.meta} numberOfLines={1}>{song.artist}</Text>
                </View>
                <View
                  style={[styles.serviceDot, { backgroundColor: SERVICE_COLORS[song.service] }]}
                />
              </TouchableOpacity>
            ))}
            {favSearchResults.length === 0 && favSearchQuery.length > 0 && !searchingFav && (
              <Text style={modalStyles.empty}>No results. Try a different search.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  scroll: {
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  avatarFallback: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 3,
  },
  cameraEmoji: {
    fontSize: 14,
  },
  displayName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 3,
    letterSpacing: -0.3,
  },
  username: {
    color: '#555',
    fontSize: 14,
    marginBottom: 12,
  },
  bio: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  bioPlaceholder: {
    color: '#444',
    fontSize: 14,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  bioEditRow: {
    width: '100%',
    marginTop: 4,
  },
  bioInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  bioEditActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  bioCancel: {
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  bioCancelText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  bioSave: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  bioSaveText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Stats row ─────────────────────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1a1a1a',
    marginBottom: 4,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#2a2a2a',
    marginHorizontal: 24,
  },

  // ── Taste tags ────────────────────────────────────────────────────────────
  tasteTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 12,
    justifyContent: 'center',
  },

  // ── Generic section ───────────────────────────────────────────────────────
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
    marginTop: -6,
  },
  emptyHint: {
    color: '#444',
    fontSize: 13,
    fontStyle: 'italic',
  },
  addButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  addButtonText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Favorite song ─────────────────────────────────────────────────────────
  favSongRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minHeight: 64,
  },
  favCover: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  favCoverFallback: {
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favInfo: { flex: 1 },
  favTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  favArtist: { color: '#666', fontSize: 12 },
  favPlaceholder: { color: '#444', fontSize: 14, fontStyle: 'italic', flex: 1 },
  serviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  favSearchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  favSearchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  favSearchButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favSearchDisabled: { opacity: 0.6 },
  favSearchButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Wrapped stats card ────────────────────────────────────────────────────
  wrappedCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  wrappedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  wrappedLabel: { color: '#666', fontSize: 14 },
  wrappedValue: { color: '#fff', fontSize: 14, fontWeight: '700', maxWidth: '55%' },

  // ── Horizontal scroll sections ────────────────────────────────────────────
  hScroll: { marginLeft: -16, paddingLeft: 16 },

  artistCard: {
    width: 80,
    marginRight: 12,
    alignItems: 'center',
  },
  artistImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 6,
  },
  artistImageFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistName: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 15,
  },

  trackCard: {
    width: 100,
    marginRight: 12,
  },
  trackCover: {
    width: 100,
    height: 100,
    borderRadius: 10,
    marginBottom: 6,
  },
  trackCoverFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackRank: {
    color: '#444',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
    marginBottom: 2,
  },
  trackArtist: {
    color: '#666',
    fontSize: 11,
  },

  // ── Pinned playlists ──────────────────────────────────────────────────────
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  pinnedCover: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  pinnedCoverFallback: {
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinnedInfo: { flex: 1 },
  pinnedName: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  pinnedMeta: { color: '#666', fontSize: 12 },
  unpinButton: { padding: 4 },
  unpinText: { color: '#444', fontSize: 16 },

  // ── Listening history ─────────────────────────────────────────────────────
  historyList: { marginTop: 4 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  historyCover: {
    width: 38,
    height: 38,
    borderRadius: 6,
  },
  historyCoverFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyInfo: { flex: 1 },
  historyTitle: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 1 },
  historyArtist: { color: '#555', fontSize: 12 },

  // ── Services ──────────────────────────────────────────────────────────────
  setPrimaryButton: {
    alignSelf: 'flex-end',
    marginTop: -6,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  setPrimaryText: {
    color: '#888',
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  primaryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  primaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  primaryInfoText: { color: '#666', fontSize: 13 },
  primaryInfoHighlight: { color: '#888', fontWeight: '600' },

  // ── Sign out ──────────────────────────────────────────────────────────────
  signOutButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  signOutDisabled: { opacity: 0.6 },
  signOutText: { color: '#ff4444', fontSize: 16, fontWeight: '600' },
});

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  close: { padding: 4 },
  closeText: { color: '#666', fontSize: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  coverFallback: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  meta: { color: '#666', fontSize: 12 },
  empty: {
    color: '#444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 48,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
