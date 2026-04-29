import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Animated, FlatList, Linking, Modal,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { useSharedItems } from '../../hooks/useSharedItems';
import { useStories, Story } from '../../hooks/useStories';
import { useReactions } from '../../hooks/useReactions';
import { PlaylistModal } from '../../components/PlaylistModal';
import { StoryViewer } from '../../components/StoryViewer';
import { ShareModal } from '../../components/ShareModal';
import { AppBar, Avatar, CoverArt, IconBtn, serviceLabelShort, ServiceDot } from '../../components/ui';
import { SharedItem, MusicService } from '../../types';
import { colors } from '../../lib/theme';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { extractYouTubeTrackInfo } from '../../lib/youtubeMusic';
import { withTimeout } from '../../lib/utils';
import { supabase } from '../../lib/supabase';

type HomeTab = 'inbox' | 'following' | 'mixes';
const REACTIONS_ROW = ['🔥', '❤️', '🤯', '😮'];

// ─── StoryTray ────────────────────────────────────────────────────────────────
function StoryTray({
  storyGroups,
  myUserId,
  onViewStory,
  onPostStory,
}: {
  storyGroups: Map<string, Story[]>;
  myUserId: string;
  onViewStory: (stories: Story[]) => void;
  onPostStory: () => void;
}) {
  const entries = [...storyGroups.entries()];
  const others = entries.filter(([uid]) => uid !== myUserId);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.storyTrayContent}
      style={styles.storyTray}
    >
      {/* Own status */}
      <TouchableOpacity style={styles.storyItem} onPress={onPostStory} activeOpacity={0.8}>
        <View style={styles.storyOwnRing}>
          <View style={styles.storyOwnInner}>
            <Ionicons name="person" size={24} color={colors.fg3} />
          </View>
          <View style={styles.storyOwnPlus}>
            <Ionicons name="add" size={13} color={colors.primaryInk} />
          </View>
        </View>
        <Text style={styles.storyLabel} numberOfLines={1}>Your status</Text>
      </TouchableOpacity>

      {others.map(([uid, stories]) => {
        const first = stories[0];
        const user = first.user;
        return (
          <TouchableOpacity key={uid} style={styles.storyItem} onPress={() => onViewStory(stories)} activeOpacity={0.8}>
            <Avatar
              name={user?.display_name ?? '?'}
              avatarUrl={user?.avatar_url}
              size={56}
              ring="primary"
            />
            <Text style={styles.storyLabel} numberOfLines={1}>
              {user?.display_name?.split(' ')[0] ?? '?'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── PostStoryModal ───────────────────────────────────────────────────────────
function PostStoryModal({ visible, onClose, onPost }: {
  visible: boolean;
  onClose: () => void;
  onPost: (title: string, artist: string, caption: string, service: string) => void;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ title: string; artist: string; cover: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [caption, setCaption] = useState('');
  const [picked, setPicked] = useState<{ title: string; artist: string } | null>(null);

  const handleSearch = useCallback(async () => {
    if (!q.trim() || !user?.primary_service) return;
    setSearching(true);
    try {
      if (user.primary_service === 'spotify' && user.spotify_access_token) {
        const tracks = await Spotify.searchTracks(user.id, q.trim());
        setResults(tracks.slice(0, 6).map(t => ({
          title: t.name,
          artist: t.artists.map(a => a.name).join(', '),
          cover: t.album.images[0]?.url ?? '',
        })));
      } else if (user.primary_service === 'apple_music' && user.apple_music_user_token) {
        const tracks = await AppleMusic.searchTracks(user.id, q.trim());
        setResults(tracks.slice(0, 6).map(t => ({
          title: t.attributes.name,
          artist: t.attributes.artistName,
          cover: t.attributes.artwork ? AppleMusic.resolveArtworkUrl(t.attributes.artwork.url, 150) : '',
        })));
      } else if (user.primary_service === 'youtube_music' && user.youtube_access_token) {
        const tracks = await YouTubeMusic.searchTracks(user.id, q.trim());
        setResults(tracks.slice(0, 6).map(t => {
          const info = extractYouTubeTrackInfo(t.snippet.channelTitle, t.snippet.title);
          return {
            title: info.title,
            artist: info.artist,
            cover: t.snippet.thumbnails.medium?.url ?? '',
          };
        }));
      }
    } finally { setSearching(false); }
  }, [q, user]);

  useEffect(() => {
    if (!visible) return;
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      void handleSearch();
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [handleSearch, q, visible]);

  const handlePost = () => {
    if (!picked || !user?.primary_service) return;
    onPost(picked.title, picked.artist, caption.trim(), user.primary_service);
    setQ(''); setResults([]); setCaption(''); setPicked(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.postModal}>
        <View style={styles.postModalHeader}>
          <Text style={styles.postModalTitle}>Post a Story</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={colors.fg3} /></TouchableOpacity>
        </View>
        {picked ? (
          <View style={styles.postModalPicked}>
            <View style={styles.postModalPickedCard}>
              <Ionicons name="musical-note" size={24} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.postModalPickedTitle} numberOfLines={1}>{picked.title}</Text>
                <Text style={styles.postModalPickedArtist} numberOfLines={1}>{picked.artist}</Text>
              </View>
              <TouchableOpacity onPress={() => setPicked(null)}>
                <Ionicons name="close-circle" size={20} color={colors.fg3} />
              </TouchableOpacity>
            </View>
            <View style={styles.postModalCaptionRow}>
              <Text style={styles.postModalLabel}>Caption (optional)</Text>
              <View style={styles.postModalInput}>
                <TextInput
                  style={{ flex: 1, color: colors.fg, fontSize: 14, padding: 0 }}
                  placeholder="Add a caption…"
                  placeholderTextColor={colors.fg3}
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={120}
                  returnKeyType="done"
                />
              </View>
            </View>
            <TouchableOpacity style={styles.postBtn} onPress={handlePost} activeOpacity={0.85}>
              <Ionicons name="radio-outline" size={16} color={colors.primaryInk} />
              <Text style={styles.postBtnText}>Post Story</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.postModalSearchRow}>
            <View style={styles.postModalSearchInput}>
              <Ionicons name="search" size={16} color={colors.fg3} />
              <TextInput
                style={{ flex: 1, color: colors.fg, fontSize: 14 }}
                placeholder="Search for a song…"
                placeholderTextColor={colors.fg3}
                value={q}
                onChangeText={setQ}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => void handleSearch()}
              />
              </View>
              <TouchableOpacity style={styles.postModalSearchBtn} onPress={handleSearch} disabled={searching}>
                {searching ? <ActivityIndicator color={colors.primaryInk} size="small" /> : <Text style={styles.postModalSearchBtnText}>Search</Text>}
              </TouchableOpacity>
            </View>
            {results.map((r, i) => (
              <TouchableOpacity key={i} style={styles.postModalResult} onPress={() => setPicked(r)} activeOpacity={0.8}>
                <CoverArt uri={r.cover} size={44} radius={8} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.postModalResultTitle} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.postModalResultArtist} numberOfLines={1}>{r.artist}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>
    </Modal>
  );
}

// ─── FeedRow ──────────────────────────────────────────────────────────────────
function FeedRow({
  item,
  isResolving,
  onPress,
  reactionMap,
  myReaction,
  onReact,
  viewerService,
}: {
  item: SharedItem;
  isResolving: boolean;
  onPress: (item: SharedItem) => void;
  reactionMap: Record<string, number>;
  myReaction: string | undefined;
  onReact: (emoji: string) => void;
  viewerService: MusicService | null;
}) {
  const [showReactions, setShowReactions] = useState(false);
  const isUnread = !item.opened;
  const type = item.type === 'playlist' ? 'sent a playlist' : 'sent a song';
  const svc = viewerService ?? (item.sender?.primary_service as MusicService) ?? 'spotify';
  const totalReactions = Object.values(reactionMap).reduce((a, b) => a + b, 0);

  return (
    <View style={[styles.feedRow, isUnread && styles.feedRowUnread]}>
      <Avatar
        name={item.sender?.display_name ?? '?'}
        avatarUrl={null}
        size={36}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <Text style={styles.feedRowHeader} numberOfLines={1}>
          <Text style={styles.feedRowSender}>{item.sender?.display_name ?? 'Someone'}</Text>
          <Text style={styles.feedRowMeta}> {type} · {timeAgo(item.created_at)}</Text>
        </Text>

        {/* Card */}
        <TouchableOpacity
          style={styles.feedCard}
          onPress={() => onPress(item)}
          activeOpacity={0.85}
          disabled={isResolving}
        >
          {/* Cover + service overlay */}
          <View style={{ position: 'relative', flexShrink: 0 }}>
            <CoverArt uri={item.cover_image_url} size={56} radius={12} />
            <View style={styles.svcOverlay}>
              <ServiceDot service={svc} size={12} />
            </View>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.feedCardTitle, isUnread && styles.feedCardTitleUnread]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.artist ? (
              <Text style={styles.feedCardArtist} numberOfLines={1}>{item.artist}</Text>
            ) : null}
            <View style={styles.feedCardMeta}>
              <View style={styles.feedChip}>
                <Text style={styles.feedChipText}>{item.type}</Text>
              </View>
              <Text style={styles.feedCardService} numberOfLines={1}>
                opens in your {serviceLabelShort(svc)}
              </Text>
            </View>
          </View>

          {isResolving
            ? <Ionicons name="sync" size={18} color={colors.fg3} />
            : <Ionicons name="play" size={18} color={colors.fg2} />
          }
        </TouchableOpacity>

        {/* Message bubble */}
        {item.message ? (
          <View style={styles.messageBubble}>
            <Text style={styles.messageBubbleText}>"{item.message}"</Text>
          </View>
        ) : null}

        {/* Reaction strip */}
        <View style={styles.reactionStrip}>
          {totalReactions > 0 && (
            <View style={styles.existingReactions}>
              {Object.entries(reactionMap).filter(([, c]) => c > 0).map(([e, c]) => (
                <TouchableOpacity key={e} style={[styles.reactionPill, myReaction === e && styles.reactionPillActive]} onPress={() => onReact(e)}>
                  <Text style={styles.reactionEmoji}>{e}</Text>
                  {c > 1 && <Text style={styles.reactionCount}>{c}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TouchableOpacity style={styles.addReactionBtn} onPress={() => setShowReactions(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name={showReactions ? 'close' : 'happy-outline'} size={16} color={colors.fg3} />
          </TouchableOpacity>
        </View>

        {showReactions && (
          <View style={styles.emojiPicker}>
            {REACTIONS_ROW.map(e => (
              <TouchableOpacity key={e} style={[styles.emojiPickerBtn, myReaction === e && styles.emojiPickerBtnActive]} onPress={() => { onReact(e); setShowReactions(false); }}>
                <Text style={styles.emojiPickerEmoji}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────
export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const { items, loading, refreshing, refresh, markAsOpened, unreadCount } = useSharedItems();
  const { followingIds } = useFollows();
  const { storyGroups, postStory, reactToStory } = useStories();
  const itemIds = items.map(i => i.id);
  const { reactions, myReactions, react } = useReactions(itemIds);

  const [tab, setTab] = useState<HomeTab>('inbox');
  const [playlistModalItem, setPlaylistModalItem] = useState<SharedItem | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [viewingStories, setViewingStories] = useState<Story[] | null>(null);
  const [postStoryVisible, setPostStoryVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleItemPress = async (item: SharedItem) => {
    await markAsOpened(item.id);
    if (item.type === 'playlist') { setPlaylistModalItem(item); return; }

    const primaryService = user?.primary_service as MusicService | null;
    if (!primaryService) { Alert.alert('No service', 'Set a primary streaming service in your profile.'); return; }

    setResolvingId(item.id);
    try {
      let links: string[] = [];
      switch (primaryService) {
        case 'spotify': {
          let sid: string | null = item.spotify_id ?? null;
          if (!sid && item.title && item.artist) {
            sid = await withTimeout(Spotify.searchTrack(user!.id, item.title, item.artist), 10_000);
          }
          if (sid) links = Spotify.getSpotifyDeepLink(sid);
          break;
        }
        case 'apple_music': {
          links = await withTimeout(AppleMusic.resolveAppleMusicTrackLinks(user!.id, item.title, item.artist, item.apple_music_id), 10_000);
          break;
        }
        case 'youtube_music': {
          let ymid: string | null = item.youtube_music_id ?? null;
          if (!ymid && item.title && item.artist) {
            ymid = await withTimeout(YouTubeMusic.searchTrack(user!.id, item.title, item.artist), 10_000);
          }
          if (ymid) { links = YouTubeMusic.getYouTubeMusicDeepLink(ymid); supabase.from('shared_items').update({ youtube_music_id: ymid }).eq('id', item.id); }
          break;
        }
      }
      for (const l of links) { try { await Linking.openURL(l); return; } catch {} }
      Alert.alert('App not found', `Make sure ${primaryService.replace('_', ' ')} is installed.`);
    } catch (err: any) {
      const msg = err?.message === 'timeout' ? 'Timed out.' : err?.message === 'youtube_quota_exceeded' ? 'YouTube quota reached.' : 'Could not open song.';
      Alert.alert('Error', msg);
    } finally { setResolvingId(null); }
  };

  const handlePostStory = async (title: string, artist: string, caption: string, service: string) => {
    try { await postStory({ song_title: title, song_artist: artist, service, caption }); }
    catch { Alert.alert('Error', 'Could not post story.'); }
  };

  const filteredItems = items.filter((item) => {
    if (tab === 'following') {
      const senderId = item.sender_id ?? item.sender?.id ?? '';
      return followingIds.has(senderId);
    }
    if (tab === 'mixes') {
      return item.type === 'playlist';
    }
    return true;
  });

  const searchedItems = filteredItems.filter((item) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [
      item.title,
      item.artist ?? '',
      item.sender?.display_name ?? '',
      item.sender?.username ?? '',
    ].some((value) => value.toLowerCase().includes(q));
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App bar */}
      <AppBar
        logo
        right={
          <>
            <IconBtn name="search-outline" onPress={() => setSearchVisible(true)} />
            <IconBtn name="notifications-outline" badge={unreadCount > 0} onPress={() => router.push('/(tabs)/notifications' as any)} />
            <IconBtn name="paper-plane-outline" onPress={() => router.push('/(tabs)/friends' as any)} />
          </>
        }
      />

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['inbox', 'following', 'mixes'] as HomeTab[]).map(t => (
          <TouchableOpacity key={t} style={styles.tabItem} onPress={() => setTab(t)} activeOpacity={0.8}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'inbox' ? `Inbox${unreadCount > 0 ? ` ${unreadCount}` : ''}` : t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
            {tab === t && <View style={styles.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.divider} />

      {/* Story tray */}
      <StoryTray
        storyGroups={storyGroups}
        myUserId={user?.id ?? ''}
        onViewStory={stories => setViewingStories(stories)}
        onPostStory={() => setPostStoryVisible(true)}
      />

      <View style={styles.divider} />

      {/* Feed */}
      <FlatList
        data={filteredItems}
        keyExtractor={i => i.id}
        refreshing={refreshing}
        onRefresh={refresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="musical-notes-outline" size={44} color={colors.fg4} />
              <Text style={styles.emptyTitle}>No songs yet</Text>
              <Text style={styles.emptySubtitle}>
                {tab === 'following'
                  ? 'Shares from people you follow will appear here.'
                  : tab === 'mixes'
                    ? 'Shared playlists and mixes will appear here.'
                    : 'When friends share songs they\'ll appear here.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <FeedRow
            item={item}
            isResolving={resolvingId === item.id}
            onPress={handleItemPress}
            reactionMap={reactions[item.id] ?? {}}
            myReaction={myReactions[item.id]}
            onReact={emoji => react(item.id, emoji)}
            viewerService={(user?.primary_service as MusicService | null) ?? null}
          />
        )}
      />

      <PlaylistModal
        item={playlistModalItem}
        visible={playlistModalItem !== null}
        onClose={() => setPlaylistModalItem(null)}
      />

      {viewingStories && (
        <StoryViewer
          stories={viewingStories}
          visible={viewingStories !== null}
          onClose={() => setViewingStories(null)}
          onReact={(storyId, emoji) => reactToStory(storyId, emoji)}
        />
      )}

      <PostStoryModal
        visible={postStoryVisible}
        onClose={() => setPostStoryVisible(false)}
        onPost={handlePostStory}
      />

      <Modal visible={searchVisible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSearchVisible(false)}>
        <View style={styles.searchModal}>
          <View style={styles.searchModalHeader}>
            <Text style={styles.searchModalTitle}>Search Feed</Text>
            <TouchableOpacity onPress={() => { setSearchVisible(false); setSearchQuery(''); }}>
              <Ionicons name="close" size={22} color={colors.fg3} />
            </TouchableOpacity>
          </View>
          <View style={styles.searchModalInputRow}>
            <Ionicons name="search-outline" size={16} color={colors.fg3} />
            <TextInput
              style={styles.searchModalInput}
              placeholder="Search titles, artists, or people…"
              placeholderTextColor={colors.fg4}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
          </View>
          <FlatList
            data={searchedItems}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.searchEmptyText}>No matching shares.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultRow}
                onPress={() => {
                  setSearchVisible(false);
                  setSearchQuery('');
                  void handleItemPress(item);
                }}
                activeOpacity={0.8}
              >
                <CoverArt uri={item.cover_image_url} size={48} radius={8} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.searchResultTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.searchResultMeta} numberOfLines={1}>
                    {[item.artist, item.sender?.display_name].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Tabs
  tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 22, paddingBottom: 0 },
  tabItem: { paddingBottom: 8, position: 'relative' },
  tabText: { fontSize: 15, fontWeight: '500', color: colors.fg3 },
  tabTextActive: { color: colors.fg, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 2, borderRadius: 1, backgroundColor: colors.primary,
  },

  divider: { height: 1, backgroundColor: colors.line },

  // Story tray
  storyTray: { flexGrow: 0 },
  storyTrayContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 14 },
  storyItem: { alignItems: 'center', gap: 5, minWidth: 64 },
  storyOwnRing: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  storyOwnInner: { alignItems: 'center', justifyContent: 'center' },
  storyOwnPlus: {
    position: 'absolute', right: -2, bottom: -2,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  storyLabel: { fontSize: 11, color: colors.fg2, maxWidth: 64, textAlign: 'center' },

  // Feed
  feedRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    alignItems: 'flex-start',
  },
  feedRowUnread: {
    borderLeftColor: colors.primary,
    backgroundColor: 'rgba(124,91,244,0.045)',
  },
  feedRowHeader: { fontSize: 13, marginBottom: 6 },
  feedRowSender: { color: colors.fg, fontWeight: '600' },
  feedRowMeta: { color: colors.fg3 },

  feedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
  },
  svcOverlay: {
    position: 'absolute', right: -3, bottom: -3,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  feedCardTitle: { fontSize: 14, fontWeight: '500', color: colors.fg2 },
  feedCardTitleUnread: { fontWeight: '700', color: colors.fg },
  feedCardArtist: { fontSize: 12, color: colors.fg3, marginTop: 2 },
  feedCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, flexWrap: 'wrap' },
  feedChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, backgroundColor: colors.bgElev,
    borderWidth: 1, borderColor: colors.line,
  },
  feedChipText: { fontSize: 10, color: colors.fg3 },
  feedCardService: { fontSize: 11, color: colors.fg3, flexShrink: 1 },

  messageBubble: {
    marginTop: 7,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.bgElev,
    borderRadius: 12,
    maxWidth: '90%',
    alignSelf: 'flex-start',
  },
  messageBubbleText: { color: colors.fg2, fontSize: 13, lineHeight: 18 },

  // Reactions
  reactionStrip: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  existingReactions: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', flex: 1 },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: colors.bgCard, borderRadius: 999,
    borderWidth: 1, borderColor: colors.line,
  },
  reactionPillActive: { borderColor: colors.primary, backgroundColor: 'rgba(124,91,244,0.12)' },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, color: colors.fg3 },
  addReactionBtn: { padding: 2 },
  emojiPicker: {
    flexDirection: 'row', gap: 8, marginTop: 4, paddingVertical: 6,
  },
  emojiPickerBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  emojiPickerBtnActive: { borderColor: colors.primary, backgroundColor: 'rgba(124,91,244,0.15)' },
  emojiPickerEmoji: { fontSize: 18 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 100, gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.fg },
  emptySubtitle: { fontSize: 14, color: colors.fg3, textAlign: 'center', lineHeight: 20 },

  // Post story modal
  postModal: { flex: 1, backgroundColor: colors.bg },
  postModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  postModalTitle: { fontSize: 20, fontWeight: '700', color: colors.fg },
  postModalSearchRow: { flexDirection: 'row', gap: 10, padding: 16 },
  postModalSearchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.bgCard, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: colors.line,
  },
  postModalSearchBtn: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 11, justifyContent: 'center',
  },
  postModalSearchBtnText: { color: colors.primaryInk, fontSize: 14, fontWeight: '700' },
  postModalResult: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  postModalResultTitle: { color: colors.fg, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  postModalResultArtist: { color: colors.fg3, fontSize: 12 },
  postModalPicked: { padding: 20, gap: 16 },
  postModalPickedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.primary,
  },
  postModalPickedTitle: { color: colors.fg, fontSize: 15, fontWeight: '600' },
  postModalPickedArtist: { color: colors.fg3, fontSize: 12, marginTop: 2 },
  postModalLabel: { color: colors.fg3, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  postModalCaptionRow: { gap: 6 },
  postModalInput: {
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.line, minHeight: 56,
  },
  postBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 16,
  },
  postBtnText: { color: colors.primaryInk, fontSize: 16, fontWeight: '700' },

  searchModal: { flex: 1, backgroundColor: colors.bg },
  searchModalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchModalTitle: { fontSize: 20, fontWeight: '700', color: colors.fg },
  searchModalInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 16, backgroundColor: colors.bgCard, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.line,
  },
  searchModalInput: { flex: 1, color: colors.fg, fontSize: 14 },
  searchResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchResultTitle: { color: colors.fg, fontSize: 14, fontWeight: '600', marginBottom: 2 },
  searchResultMeta: { color: colors.fg3, fontSize: 12 },
  searchEmptyText: { color: colors.fg4, fontSize: 14, textAlign: 'center', marginTop: 48 },
});
