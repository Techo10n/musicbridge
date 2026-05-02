import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { ShareModal } from '../../components/ShareModal';
import { UserProfileModal } from '../../components/UserProfileModal';
import { Avatar, AppBar, IconBtn, TasteBar, ServiceDot, serviceLabelShort } from '../../components/ui';
import { User } from '../../types';
import { colors } from '../../lib/theme';

type PeopleTab = 'following' | 'followers' | 'suggested';
type SharedTasteRow = { sender_id: string; title: string | null; artist: string | null };
const SHARED_ITEMS_PAGE_SIZE = 500;

function norm(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccardScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const entry of a) {
    if (b.has(entry)) overlap += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union > 0 ? overlap / union : 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function fetchSharedTasteRows(userIds: string[]): Promise<SharedTasteRow[]> {
  const rows: SharedTasteRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SHARED_ITEMS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('shared_items')
      .select('sender_id, title, artist')
      .in('sender_id', userIds)
      .range(from, to);

    if (error) throw error;
    rows.push(...((data as SharedTasteRow[] | null) ?? []));
    if (!data || data.length < SHARED_ITEMS_PAGE_SIZE) break;
    from += SHARED_ITEMS_PAGE_SIZE;
  }

  return rows;
}

export default function People() {
  const { user: currentUser } = useAuth();
  const {
    following,
    followers,
    mutualFollows,
    loading,
    followUser,
    unfollowUser,
    isFollowing,
    searchUsers,
    getSuggestedUsers,
    refresh,
  } = useFollows();

  const [activeTab, setActiveTab] = useState<PeopleTab>('following');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [shareRecipient, setShareRecipient] = useState<User | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [suggestedUsers, setSuggestedUsers] = useState<User[]>([]);
  const [matchScores, setMatchScores] = useState<Record<string, number>>({});

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(searchQuery.trim());
      setSearchResults(results);
    } finally { setSearching(false); }
  }, [searchQuery, searchUsers]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      void handleSearch();
    }, 200);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [handleSearch, searchQuery]);

  useEffect(() => {
    void (async () => {
      const suggestions = await getSuggestedUsers();
      setSuggestedUsers(suggestions);
    })();
  }, [following.length, followers.length, getSuggestedUsers]);

  useEffect(() => {
    if (!currentUser?.id) return;

    const targets = [...following, ...followers, ...suggestedUsers, ...searchResults];
    const uniqueTargets = Array.from(new Map(targets.map((u) => [u.id, u])).values());
    if (uniqueTargets.length === 0) {
      setMatchScores({});
      return;
    }

    let cancelled = false;

    const computeMatchScores = async () => {
      const userIds = [currentUser.id, ...uniqueTargets.map((u) => u.id)];
      let data: SharedTasteRow[] = [];
      try {
        data = await fetchSharedTasteRows(userIds);
      } catch (err) {
        console.error('[People] taste match fetch failed:', err);
        return;
      }
      if (cancelled) return;

      const shareMap = new Map<string, { artists: Set<string>; titles: Set<string> }>();
      const ensureEntry = (userId: string) => {
        if (!shareMap.has(userId)) {
          shareMap.set(userId, { artists: new Set<string>(), titles: new Set<string>() });
        }
        return shareMap.get(userId)!;
      };

      for (const entry of data ?? []) {
        const bucket = ensureEntry(entry.sender_id as string);
        const artist = norm((entry as { artist?: string | null }).artist);
        const title = norm((entry as { title?: string | null }).title);
        if (artist) bucket.artists.add(artist);
        if (title) bucket.titles.add(title);
      }

      const currentBucket = ensureEntry(currentUser.id);
      const currentFavArtist = norm(currentUser.favorite_song?.artist);
      const currentFavTitle = norm(currentUser.favorite_song?.title);
      if (currentFavArtist) currentBucket.artists.add(currentFavArtist);
      if (currentFavTitle) currentBucket.titles.add(currentFavTitle);

      const nextScores: Record<string, number> = {};

      for (const target of uniqueTargets) {
        const bucket = ensureEntry(target.id);
        const targetFavArtist = norm(target.favorite_song?.artist);
        const targetFavTitle = norm(target.favorite_song?.title);
        if (targetFavArtist) bucket.artists.add(targetFavArtist);
        if (targetFavTitle) bucket.titles.add(targetFavTitle);

        const artistScore = jaccardScore(currentBucket.artists, bucket.artists);
        const titleScore = jaccardScore(currentBucket.titles, bucket.titles);
        const sameService = currentUser.primary_service && target.primary_service === currentUser.primary_service ? 1 : 0;
        const favoriteArtistMatch = currentFavArtist && targetFavArtist && currentFavArtist === targetFavArtist ? 1 : 0;
        const favoriteTitleMatch = currentFavTitle && targetFavTitle && currentFavTitle === targetFavTitle ? 1 : 0;
        const dataPoints = currentBucket.artists.size + currentBucket.titles.size + bucket.artists.size + bucket.titles.size;
        const baseline = dataPoints > 0 ? 32 : 24;

        nextScores[target.id] = clampScore(
          baseline
          + artistScore * 34
          + titleScore * 18
          + sameService * 8
          + favoriteArtistMatch * 6
          + favoriteTitleMatch * 10,
        );
      }

      if (!cancelled) {
        setMatchScores(nextScores);
      }
    };

    void computeMatchScores();

    return () => {
      cancelled = true;
    };
  }, [currentUser, followers, following, searchResults, suggestedUsers]);

  const handleFollow = async (userId: string) => {
    try { await followUser(userId); await refresh(); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not follow'); }
  };
  const handleUnfollow = async (userId: string) => {
    try { await unfollowUser(userId); await refresh(); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not unfollow'); }
  };

  const listData = activeTab === 'following'
    ? [...following].sort((a, b) => (matchScores[b.id] ?? 0) - (matchScores[a.id] ?? 0))
    : activeTab === 'followers'
      ? [...followers].sort((a, b) => (matchScores[b.id] ?? 0) - (matchScores[a.id] ?? 0))
      : [];
  const hasStreak = (userId: string) => (matchScores[userId] ?? 0) >= 80;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar
        title="People"
        right={<IconBtn name="person-add-outline" />}
      />

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchPill}>
          <Ionicons name="search-outline" size={16} color={colors.fg3} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by username…"
            placeholderTextColor={colors.fg4}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
      </View>

      {/* Search results overlay */}
      {searchResults.length > 0 && (
        <View style={styles.searchResults}>
          {searchResults.map(u => (
            <PersonRow
              key={u.id}
              user={u}
              isFollowing={isFollowing(u.id)}
              isMutual={isMutual(u.id, mutualFollows)}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              onShare={isMutual(u.id, mutualFollows) ? () => setShareRecipient(u) : undefined}
              matchPct={matchScores[u.id]}
              onViewProfile={() => setViewingUserId(u.id)}
            />
          ))}
        </View>
      )}

      {/* Tab bar — border-bottom style matching design */}
      <View style={styles.tabBar}>
        {(['following', 'followers', 'suggested'] as PeopleTab[]).map(t => {
          const isActive = activeTab === t;
          return (
            <TouchableOpacity
              key={t}
              style={styles.tab}
              onPress={() => setActiveTab(t)}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t === 'following'
                  ? <><Text style={[styles.tabText, isActive && styles.tabTextActive]}>Following </Text><Text style={{ color: colors.fg3, fontWeight: '500' }}>{following.length > 0 ? following.length : ''}</Text></>
                  : t === 'followers'
                  ? <><Text style={[styles.tabText, isActive && styles.tabTextActive]}>Followers </Text><Text style={{ color: colors.fg3, fontWeight: '500' }}>{followers.length > 0 ? followers.length : ''}</Text></>
                  : 'Suggested'}
              </Text>
              {isActive && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : activeTab === 'suggested' ? (
        <SuggestedSection
          users={suggestedUsers}
          matchScores={matchScores}
          onFollow={handleFollow}
          onViewProfile={u => setViewingUserId(u.id)}
        />
      ) : (
        <>
          {listData.length > 0 && (
            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>
                {activeTab === 'following' ? 'Top taste matches' : 'Your followers'}
              </Text>
            </View>
          )}
          <FlatList
            data={listData}
            keyExtractor={u => u.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {activeTab === 'following' ? 'Not following anyone yet — search above' : 'Nobody following you yet'}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <PersonRow
                user={item}
                isFollowing={isFollowing(item.id)}
                isMutual={isMutual(item.id, mutualFollows)}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                onShare={isMutual(item.id, mutualFollows) ? () => setShareRecipient(item) : undefined}
                matchPct={matchScores[item.id]}
                streak={hasStreak(item.id) ? Math.floor((matchScores[item.id] ?? 0) / 10) : undefined}
                onViewProfile={() => setViewingUserId(item.id)}
              />
            )}
          />
        </>
      )}

      <ShareModal
        visible={shareRecipient !== null}
        recipient={shareRecipient}
        onClose={() => setShareRecipient(null)}
        onShared={() => setShareRecipient(null)}
      />
      <UserProfileModal userId={viewingUserId} onClose={() => setViewingUserId(null)} />
    </SafeAreaView>
  );
}

function isMutual(userId: string, mutuals: User[]) {
  return mutuals.some(m => m.id === userId);
}

// ─── PersonRow ────────────────────────────────────────────────────────────────
function PersonRow({
  user, isFollowing, isMutual, onFollow, onUnfollow, onShare, matchPct, streak, onViewProfile,
}: {
  user: User;
  isFollowing: boolean;
  isMutual: boolean;
  onFollow: (id: string) => void;
  onUnfollow: (id: string) => void;
  onShare?: () => void;
  matchPct?: number;
  streak?: number;
  onViewProfile?: () => void;
}) {
  const svc = (user as any).primary_service as string | undefined;
  return (
    <TouchableOpacity style={styles.personRow} onPress={onViewProfile} activeOpacity={0.8}>
      <Avatar name={user.display_name} avatarUrl={user.avatar_url} size={48} />
      <View style={styles.personInfo}>
        <View style={styles.personNameRow}>
          <Text style={styles.personName} numberOfLines={1}>{user.display_name}</Text>
          {streak != null && <Text style={styles.streakBadge}>🔥{streak}</Text>}
        </View>
        <View style={styles.personMeta}>
          {svc && <ServiceDot service={svc} size={8} />}
          <Text style={styles.personUsername} numberOfLines={1}>@{user.username}</Text>
          {isMutual && <Text style={styles.mutualBadge} numberOfLines={1}>· mutual</Text>}
        </View>
        {matchPct != null && (
          <View style={styles.matchRow}>
            <TasteBar pct={matchPct} />
            <Text style={styles.matchPct}>{matchPct}% match</Text>
          </View>
        )}
      </View>
      <View style={styles.personActions}>
        {onShare && (
          <TouchableOpacity style={styles.sendBtn} onPress={onShare} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="paper-plane-outline" size={16} color={colors.fg2} />
            <Text style={styles.sendBtnText}>Send</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={() => isFollowing ? onUnfollow(user.id) : onFollow(user.id)}
          activeOpacity={0.8}
        >
          <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── SuggestedSection ─────────────────────────────────────────────────────────
function SuggestedSection({
  users,
  matchScores,
  onFollow,
  onViewProfile,
}: {
  users: User[];
  matchScores: Record<string, number>;
  onFollow: (id: string) => void;
  onViewProfile: (u: User) => void;
}) {
  if (users.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No suggestions right now. Try searching for people directly.</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>You might know</Text>
      </View>
      {[...users]
        .sort((a, b) => (matchScores[b.id] ?? 0) - (matchScores[a.id] ?? 0))
        .slice(0, 8)
        .map(u => (
        <TouchableOpacity key={u.id} style={styles.personRow} onPress={() => onViewProfile(u)} activeOpacity={0.8}>
          <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={44} />
          <View style={styles.personInfo}>
            <Text style={styles.personName}>{u.display_name}</Text>
            <Text style={styles.personUsername}>@{u.username}</Text>
            {matchScores[u.id] != null && (
              <View style={styles.matchRow}>
                <TasteBar pct={matchScores[u.id]} />
                <Text style={styles.matchPct}>{matchScores[u.id]}% match</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.followBtn} onPress={() => onFollow(u.id)} activeOpacity={0.8}>
            <Text style={styles.followBtnText}>Follow</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  searchRow: { paddingHorizontal: 20, paddingBottom: 12 },
  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.bgCard, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: colors.line,
  },
  searchInput: { flex: 1, color: colors.fg, fontSize: 14 },

  searchResults: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: colors.bgCard, borderRadius: 14,
    overflow: 'hidden', borderWidth: 1, borderColor: colors.line,
  },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.line,
    marginBottom: 0,
  },
  tab: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    position: 'relative',
  },
  tabActive: {},
  tabText: { fontSize: 14, fontWeight: '500', color: colors.fg3 },
  tabTextActive: { color: colors.fg, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute', bottom: -1, left: '20%', right: '20%',
    height: 2, backgroundColor: colors.primary, borderRadius: 1,
  },

  sectionLabel: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  sectionLabelText: {
    fontSize: 11, fontWeight: '600', color: colors.fg3,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sep: { height: 1, backgroundColor: colors.line, marginLeft: 76 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { color: colors.fg3, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Person row
  personRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, gap: 12,
  },
  personInfo: { flex: 1, minWidth: 0 },
  personNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personName: { fontSize: 15, fontWeight: '600', color: colors.fg, flexShrink: 1 },
  streakBadge: { fontSize: 12 },
  personMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  personUsername: { fontSize: 12, color: colors.fg3, flexShrink: 1 },
  mutualBadge: { fontSize: 11, color: colors.violet, flexShrink: 0 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  matchPct: { fontSize: 11, color: colors.fg3, fontVariant: ['tabular-nums'] },

  personActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 999, borderWidth: 1, borderColor: colors.line,
  },
  sendBtnText: { color: colors.fg2, fontSize: 12, fontWeight: '600' },
  followBtn: {
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: 7, paddingHorizontal: 16,
  },
  followingBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line2 },
  followBtnText: { color: colors.primaryInk, fontSize: 13, fontWeight: '700' },
  followingBtnText: { color: colors.fg3 },
});
