import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSharedItems } from '../../hooks/useSharedItems';
import { useFollows } from '../../hooks/useFollows';
import { AppBar, Avatar, CoverArt } from '../../components/ui';
import { colors } from '../../lib/theme';
import { User } from '../../types';

type FilterType = 'all' | 'shares' | 'follows' | 'reactions';
const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'shares', label: 'Shares' },
  { id: 'follows', label: 'Follows' },
  { id: 'reactions', label: 'Reactions' },
];

type NotifKind = 'share' | 'follow' | 'streak' | 'reaction' | 'taste';
interface NotifItem {
  id: string;
  kind: NotifKind;
  created_at: string;
  unread: boolean;
  who: string;
  body: string;
  avatarUrl: string | null;
  primaryService: string | null;
  // Extra data
  coverUrl?: string | null;
  songTitle?: string;
  followerId?: string;
}

type FollowRow = {
  id: string;
  created_at: string;
  follower: Array<Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url' | 'primary_service'>> | null;
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function ActivityScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, loading: loadingShares, markAsOpened } = useSharedItems();
  const { followUser, isFollowing } = useFollows();
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [loadingFollows, setLoadingFollows] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  const loadFollowActivity = useCallback(async () => {
    if (!user?.id) { setFollowRows([]); setLoadingFollows(false); return; }
    setLoadingFollows(true);
    try {
      const { data } = await supabase
        .from('follows')
        .select('id, created_at, follower:follower_id(id, username, display_name, avatar_url, primary_service)')
        .eq('following_id', user.id)
        .order('created_at', { ascending: false })
        .limit(25);
      setFollowRows((data as unknown as FollowRow[]) ?? []);
    } catch { setFollowRows([]); }
    finally { setLoadingFollows(false); }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { void loadFollowActivity(); }, [loadFollowActivity]));

  const notifications = useMemo<NotifItem[]>(() => {
    const shareNotifs: NotifItem[] = items.slice(0, 25).map(item => ({
      id: `share:${item.id}`,
      kind: 'share',
      created_at: item.created_at,
      unread: !item.opened,
      who: item.sender?.display_name ?? 'Someone',
      body: `sent you "${item.title ?? 'a song'}"`,
      avatarUrl: item.sender?.avatar_url ?? null,
      primaryService: item.sender?.primary_service ?? null,
      coverUrl: item.cover_image_url,
      songTitle: item.title,
    }));

    const followNotifs: NotifItem[] = followRows.flatMap(entry => {
      const f = entry.follower?.[0];
      if (!f) return [];
      return [{
        id: `follow:${entry.id}`,
        kind: 'follow' as NotifKind,
        created_at: entry.created_at,
        unread: false,
        who: f.display_name ?? 'Someone',
        body: 'started following you',
        avatarUrl: f.avatar_url ?? null,
        primaryService: f.primary_service ?? null,
        followerId: f.id,
      }];
    });

    const all = [...shareNotifs, ...followNotifs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filter === 'all') return all;
    if (filter === 'shares') return all.filter(n => n.kind === 'share');
    if (filter === 'follows') return all.filter(n => n.kind === 'follow');
    return all;
  }, [items, followRows, filter]);

  const loading = loadingShares || loadingFollows;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* App bar */}
      <AppBar
        left={
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.fg2} />
          </TouchableOpacity>
        }
        title="Activity"
      />

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filter === f.id && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && notifications.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={n => n.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={44} color={colors.fg4} />
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptySubtitle}>Shares and activity will appear here.</Text>
            </View>
          }
          renderItem={({ item: notif }) => (
            <NotifRow
              notif={notif}
              onPress={() => {
                if (notif.kind === 'share') {
                  void markAsOpened(notif.id.replace('share:', ''));
                  router.push('/(tabs)/home' as any);
                } else if (notif.kind === 'follow') {
                  router.push('/(tabs)/friends' as any);
                }
              }}
              onFollowBack={notif.kind === 'follow' && notif.followerId
                ? () => followUser(notif.followerId!)
                : undefined
              }
              isFollowingBack={notif.kind === 'follow' && notif.followerId
                ? isFollowing(notif.followerId)
                : false
              }
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

// ─── NotifRow ─────────────────────────────────────────────────────────────────
function NotifRow({
  notif, onPress, onFollowBack, isFollowingBack,
}: {
  notif: NotifItem;
  onPress: () => void;
  onFollowBack?: () => void;
  isFollowingBack?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, notif.unread && styles.rowUnread]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <Avatar name={notif.who} avatarUrl={notif.avatarUrl} size={44} />

      <View style={styles.rowBody}>
        <Text style={styles.rowText} numberOfLines={2}>
          <Text style={styles.rowWho}>{notif.who}</Text>
          <Text style={styles.rowBodyText}> {notif.body}</Text>
        </Text>
        <Text style={styles.rowTime}>{timeAgo(notif.created_at)}</Text>
      </View>

      {/* Right-side decoration */}
      {notif.kind === 'follow' && (
        <TouchableOpacity
          style={[styles.followBackBtn, isFollowingBack && styles.followBackBtnDone]}
          onPress={e => { e.stopPropagation(); onFollowBack?.(); }}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.followBackBtnText, isFollowingBack && styles.followBackBtnTextDone]}>
            {isFollowingBack ? 'Following' : 'Follow back'}
          </Text>
        </TouchableOpacity>
      )}
      {notif.kind === 'share' && notif.coverUrl && (
        <CoverArt uri={notif.coverUrl} size={44} radius={8} />
      )}
      {notif.kind === 'share' && !notif.coverUrl && (
        <View style={styles.shareMusicIcon}>
          <Ionicons name="musical-note" size={18} color={colors.primary} />
        </View>
      )}
      {notif.kind === 'streak' && (
        <Text style={styles.streakEmoji}>🔥</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  filterRow: {
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.line,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '500', color: colors.fg2 },
  filterChipTextActive: { color: colors.primaryInk, fontWeight: '600' },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 13, gap: 12,
  },
  rowUnread: { backgroundColor: 'rgba(124,91,244,0.045)' },
  rowBody: { flex: 1, minWidth: 0 },
  rowText: { fontSize: 14, lineHeight: 20 },
  rowWho: { color: colors.fg, fontWeight: '700' },
  rowBodyText: { color: colors.fg2 },
  rowTime: { fontSize: 11, color: colors.fg3, marginTop: 3 },

  followBackBtn: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 14,
  },
  followBackBtnDone: { backgroundColor: 'transparent', borderColor: colors.line2 },
  followBackBtnText: { fontSize: 12, fontWeight: '600', color: colors.fg },
  followBackBtnTextDone: { color: colors.fg3 },

  shareMusicIcon: {
    width: 44, height: 44, borderRadius: 8,
    backgroundColor: 'rgba(124,91,244,0.12)',
    borderWidth: 1, borderColor: 'rgba(124,91,244,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  streakEmoji: { fontSize: 24 },

  empty: { alignItems: 'center', paddingTop: 80, gap: 10, paddingHorizontal: 40 },
  emptyTitle: { color: colors.fg, fontSize: 18, fontWeight: '700' },
  emptySubtitle: { color: colors.fg3, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
