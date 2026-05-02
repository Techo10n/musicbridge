import { useMemo, useState } from 'react';
import {
  Alert, FlatList, Linking, Modal,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { useSharedItems } from '../../hooks/useSharedItems';
import { useReactions } from '../../hooks/useReactions';
import { PlaylistModal } from '../../components/PlaylistModal';
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
  const shareType = item.type === 'playlist' ? 'sent a playlist' : 'sent a song';
  const svc = viewerService ?? (item.sender?.primary_service as MusicService) ?? 'spotify';
  const totalReactions = Object.values(reactionMap).reduce((a, b) => a + b, 0);

  return (
    <View style={[styles.feedCard, isUnread && styles.feedCardUnread]}>
      <View style={styles.feedCardHeader}>
        <View style={styles.senderIdentity}>
          <Avatar
            name={item.sender?.display_name ?? '?'}
            avatarUrl={item.sender?.avatar_url ?? null}
            size={34}
          />
          <View style={styles.senderTextWrap}>
            <Text style={styles.feedRowSender} numberOfLines={1}>{item.sender?.display_name ?? 'Someone'}</Text>
          </View>
        </View>
        <View style={styles.headerAction}>
          <Text style={styles.shareTypeText} numberOfLines={1}>{shareType} · {timeAgo(item.created_at)}</Text>
          {isUnread && <View style={styles.unreadDot} />}
          {isResolving ? <Ionicons name="sync" size={17} color={colors.fg3} /> : null}
        </View>
      </View>

      <TouchableOpacity
        style={styles.feedMediaRow}
        onPress={() => onPress(item)}
        activeOpacity={0.85}
        disabled={isResolving}
      >
        <View style={{ position: 'relative', flexShrink: 0 }}>
          <CoverArt uri={item.cover_image_url} size={58} radius={12} />
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

        <Ionicons name="play-circle" size={38} color={colors.primary} style={{ opacity: isResolving ? 0.4 : 1 }} />
      </TouchableOpacity>

      {item.message ? (
        <View style={styles.messageBubble}>
          <Text style={styles.messageBubbleText}>"{item.message}"</Text>
        </View>
      ) : null}

      <View style={styles.reactionStrip}>
        <View style={styles.existingReactions}>
          {Object.entries(reactionMap).filter(([, c]) => c > 0).map(([e, c]) => {
            const isMine = myReaction === e;
            const othersCount = c - (isMine ? 1 : 0);
            return (
              <TouchableOpacity key={e} style={[styles.reactionPill, isMine && styles.reactionPillActive]} onPress={() => onReact(e)}>
                <Text style={styles.reactionEmoji}>{e}</Text>
                {othersCount > 0 && <Text style={styles.reactionCount}>{othersCount}</Text>}
              </TouchableOpacity>
            );
          })}
          {totalReactions === 0 ? <Text style={styles.noReactionsText}>No reactions yet</Text> : null}
        </View>
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
  const itemIds = useMemo(() => items.map(i => i.id), [items]);
  const { reactions, myReactions, react } = useReactions(itemIds);

  const [tab, setTab] = useState<HomeTab>('inbox');
  const [playlistModalItem, setPlaylistModalItem] = useState<SharedItem | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleItemPress = async (item: SharedItem) => {
    void markAsOpened(item.id);
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
      for (const l of links) { try { await Linking.openURL(l); return; } catch { } }
      Alert.alert('App not found', `Make sure ${primaryService.replace('_', ' ')} is installed.`);
    } catch (err: any) {
      const msg = err?.message === 'timeout' ? 'Timed out.' : err?.message === 'youtube_quota_exceeded' ? 'YouTube quota reached.' : 'Could not open song.';
      Alert.alert('Error', msg);
    } finally { setResolvingId(null); }
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

  // Feed
  feedRowSender: { color: colors.fg, fontWeight: '600' },
  feedRowMeta: { color: colors.fg3 },

  feedCard: {
    marginHorizontal: 16,
    marginTop: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.line,
    borderLeftWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  feedCardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    backgroundColor: 'rgba(124,91,244,0.055)',
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  senderIdentity: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 },
  senderTextWrap: { flex: 1, minWidth: 0 },
  headerAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, maxWidth: '48%', paddingRight: 6 },
  shareTypeText: { color: colors.fg3, fontSize: 12 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  feedMediaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
    marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.bgElev,
    borderRadius: 12,
  },
  messageBubbleText: { color: colors.fg2, fontSize: 13, lineHeight: 18 },

  // Reactions
  reactionStrip: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 },
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
  noReactionsText: { color: colors.fg4, fontSize: 12, paddingVertical: 4 },
  addReactionBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgElev, borderWidth: 1, borderColor: colors.line,
  },
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
