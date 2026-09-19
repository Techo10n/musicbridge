import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useSharedItems } from '../../hooks/useSharedItems';
import { useFollows } from '../../hooks/useFollows';
import { AppBar, Avatar, CoverArt, EmptyState, SegmentedTabs, Txt } from '../../components/ui';
import { makeStyles, useTheme } from '../../lib/theme';
import { timeAgo } from '../../lib/utils';
import { User } from '../../types';

type FilterType = 'all' | 'shares' | 'follows';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'shares', label: 'Shares' },
  { id: 'follows', label: 'Follows' },
] as const satisfies readonly { id: FilterType; label: string }[];

type NotifKind = 'share' | 'follow';
interface NotifItem {
  id: string;
  kind: NotifKind;
  created_at: string;
  unread: boolean;
  who: string;
  body: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
  followerId?: string;
}

type FollowRow = {
  id: string;
  created_at: string;
  follower: Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url' | 'primary_service'> | null;
};

export default function ActivityScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id;
  const { items, loading: loadingShares, markAsOpened } = useSharedItems();
  const { followUser, isFollowing } = useFollows();
  const [followRows, setFollowRows] = useState<FollowRow[]>([]);
  const [loadingFollows, setLoadingFollows] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  const loadFollowActivity = useCallback(async () => {
    if (!userId) { setFollowRows([]); setLoadingFollows(false); return; }
    setLoadingFollows(true);
    try {
      const { data: follows } = await supabase
        .from('follows')
        .select('id, created_at, follower_id')
        .eq('following_id', userId)
        .order('created_at', { ascending: false })
        .limit(25);
      const rows = follows ?? [];

      // `follower_id` only names the row; public profile fields live in
      // `user_public_profiles`, not the owner-only `users` table.
      const followerIds = Array.from(new Set(rows.map((r) => r.follower_id as string)));
      const profileById = new Map<string, FollowRow['follower']>();
      if (followerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_public_profiles')
          .select('id, username, display_name, avatar_url, primary_service')
          .in('id', followerIds);
        for (const p of profiles ?? []) profileById.set(p.id, p);
      }

      setFollowRows(rows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        follower: profileById.get(r.follower_id as string) ?? null,
      })));
    } catch (err) {
      console.error('[notifications] follow activity fetch error:', err);
      setFollowRows([]);
    } finally { setLoadingFollows(false); }
  }, [userId]);

  useFocusEffect(useCallback(() => { void Promise.resolve().then(loadFollowActivity); }, [loadFollowActivity]));

  const notifications = useMemo<NotifItem[]>(() => {
    const shareNotifs: NotifItem[] = items.slice(0, 25).map((item) => ({
      id: `share:${item.id}`,
      kind: 'share',
      created_at: item.created_at,
      unread: !item.opened,
      who: item.sender?.display_name ?? 'Someone',
      body: `sent you "${item.title ?? 'a song'}"`,
      avatarUrl: item.sender?.avatar_url ?? null,
      coverUrl: item.cover_image_url,
    }));

    const followNotifs: NotifItem[] = followRows.flatMap((entry) => {
      const f = entry.follower;
      if (!f) return [];
      return [{
        id: `follow:${entry.id}`,
        kind: 'follow' as const,
        created_at: entry.created_at,
        unread: false,
        who: f.display_name ?? 'Someone',
        body: 'started following you',
        avatarUrl: f.avatar_url ?? null,
        followerId: f.id,
      }];
    });

    const all = [...shareNotifs, ...followNotifs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (filter === 'shares') return all.filter((n) => n.kind === 'share');
    if (filter === 'follows') return all.filter((n) => n.kind === 'follow');
    return all;
  }, [items, followRows, filter]);

  const loading = loadingShares || loadingFollows;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AppBar onBack={() => router.back()} title="Activity" />

      <View style={s.filters}>
        <SegmentedTabs tabs={FILTERS} value={filter} onChange={setFilter} variant="pill" />
      </View>

      {loading && notifications.length === 0 ? (
        <View style={s.loadingCenter}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <EmptyState
              icon="notifications-outline"
              title="Nothing here yet"
              body={filter === 'follows' ? 'When someone follows you, it shows up here.' : 'Songs friends send you and new followers land here.'}
            />
          }
          renderItem={({ item: notif }) => (
            <NotifRow
              notif={notif}
              onPress={() => {
                if (notif.kind === 'share') {
                  void markAsOpened(notif.id.replace('share:', ''));
                  router.push('/(tabs)/home');
                } else {
                  router.push('/(tabs)/friends');
                }
              }}
              onFollowBack={notif.followerId ? () => followUser(notif.followerId!) : undefined}
              isFollowingBack={notif.followerId ? isFollowing(notif.followerId) : false}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function NotifRow({
  notif, onPress, onFollowBack, isFollowingBack,
}: {
  notif: NotifItem;
  onPress: () => void;
  onFollowBack?: () => void;
  isFollowingBack?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={[s.row, notif.unread && s.rowUnread]} onPress={onPress} activeOpacity={0.82} accessibilityRole="button">
      <View>
        <Avatar name={notif.who} avatarUrl={notif.avatarUrl} size={44} />
        <View style={s.kindBadge}>
          <Ionicons name={notif.kind === 'share' ? 'musical-note' : 'person-add'} size={10} color={colors.accentInk} />
        </View>
      </View>

      <View style={s.rowBody}>
        <Txt variant="callout" color="text2" numberOfLines={2}>
          <Txt variant="callout" style={{ fontWeight: '700', color: colors.text }}>{notif.who}</Txt>
          {` ${notif.body}`}
        </Txt>
        <Txt variant="caption" color="text3" style={s.rowTime}>{timeAgo(notif.created_at)}</Txt>
      </View>

      {notif.kind === 'follow' ? (
        <TouchableOpacity
          style={[s.followBackBtn, isFollowingBack && s.followBackBtnDone]}
          onPress={onFollowBack}
          activeOpacity={0.8}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Txt variant="captionStrong" style={isFollowingBack ? s.followBackTextDone : s.followBackText}>
            {isFollowingBack ? 'Following' : 'Follow back'}
          </Txt>
        </TouchableOpacity>
      ) : (
        <CoverArt uri={notif.coverUrl} size={44} />
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  filters: { paddingBottom: spacing.md, paddingTop: spacing.xs },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md + 1, gap: spacing.md,
  },
  rowUnread: { backgroundColor: colors.accentSoft },
  kindBadge: {
    position: 'absolute', right: -3, bottom: -3,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTime: { marginTop: 3 },
  followBackBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.lg - 2,
  },
  followBackBtnDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.lineStrong },
  followBackText: { color: colors.accentInk },
  followBackTextDone: { color: colors.text3 },
}));
