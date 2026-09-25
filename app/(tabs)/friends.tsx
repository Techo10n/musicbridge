import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { ShareComposer } from '../../components/ShareComposer';
import { UserProfileModal } from '../../components/UserProfileModal';
import { InviteSheet } from '../../components/InviteSheet';
import {
  AppBar, Avatar, EmptyState, IconBtn, ListRow, SegmentedTabs, ServiceDot, TasteBar, Txt, useToast,
} from '../../components/ui';
import { User } from '../../types';
import { Relationship, relationshipFor } from '../../lib/friends';
import { makeStyles, useTheme } from '../../lib/theme';

type Tab = 'friends' | 'requests' | 'suggested';
type SharedTasteRow = { sender_id: string; title: string | null; artist: string | null };

const SHARED_ITEMS_PAGE_SIZE = 500;
/** Below this many known songs across both people, a percentage is noise. */
const MIN_TASTE_DATA = 4;

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
  for (const entry of a) if (b.has(entry)) overlap += 1;
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

// ─── Person row ───────────────────────────────────────────────────────────────

function PersonRow({
  person, relationship, match, onPress, onAdd, onSend,
}: {
  person: User;
  relationship: Relationship;
  /** Null when there is not enough listening in common to say anything. */
  match: number | null | undefined;
  onPress: () => void;
  onAdd: () => void;
  onSend?: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();

  return (
    <ListRow
      leading={<Avatar name={person.display_name} avatarUrl={person.avatar_url} size={48} />}
      title={person.display_name}
      subtitle={`@${person.username}`}
      onPress={onPress}
      extra={
        <View style={s.meta}>
          {person.primary_service ? <ServiceDot service={person.primary_service} /> : null}
          {match != null ? (
            <>
              <TasteBar pct={match} />
              <Txt variant="caption" color="text3">{`${match}% match`}</Txt>
            </>
          ) : (
            <Txt variant="caption" color="text4">Not enough in common yet</Txt>
          )}
        </View>
      }
      trailing={
        <View style={s.actions}>
          {relationship === 'friends' && onSend ? (
            <TouchableOpacity
              style={s.sendBtn}
              onPress={onSend}
              accessibilityRole="button"
              accessibilityLabel={`Send a song to ${person.display_name}`}
            >
              <Ionicons name="paper-plane-outline" size={16} color={colors.text2} />
            </TouchableOpacity>
          ) : null}

          {relationship === 'friends' ? (
            <View style={s.stateTag}>
              <Ionicons name="checkmark" size={13} color={colors.text3} />
              <Txt variant="captionStrong" color="text3">Friends</Txt>
            </View>
          ) : relationship === 'pending' ? (
            <View style={s.stateTag}>
              <Txt variant="captionStrong" color="text3">Waiting</Txt>
            </View>
          ) : (
            <TouchableOpacity style={s.addBtn} onPress={onAdd} accessibilityRole="button">
              <Txt variant="captionStrong" style={{ color: colors.accentInk }}>
                {relationship === 'request' ? 'Add back' : 'Add'}
              </Txt>
            </TouchableOpacity>
          )}
        </View>
      }
    />
  );
}

/** Always-present way out of an empty friends list. */
function InviteRow({ onPress }: { onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={s.inviteRow} onPress={onPress} activeOpacity={0.85} accessibilityRole="button">
      <View style={s.inviteIcon}>
        <Ionicons name="person-add" size={17} color={colors.accentInk} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="bodyStrong">Add a friend</Txt>
        <Txt variant="caption" color="text3">Send them your link</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text3} />
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Friends() {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const {
    mutualFollows, requests, pending, loading,
    followUser, searchUsers, getSuggestedUsers, refresh,
  } = useFollows();

  const [tab, setTab] = useState<Tab>('friends');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggested, setSuggested] = useState<User[]>([]);
  const [matches, setMatches] = useState<Record<string, number | null>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState<User | null>(null);

  // ── Search ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const isEmpty = !query.trim();
    const timer = setTimeout(() => {
      if (isEmpty) { setResults(null); setSearching(false); return; }
      void (async () => {
        setSearching(true);
        try {
          setResults(await searchUsers(query.trim()));
        } finally {
          setSearching(false);
        }
      })();
    }, isEmpty ? 0 : 250);
    return () => clearTimeout(timer);
  }, [query, searchUsers]);

  // ── Suggestions ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const people = await getSuggestedUsers(12);
        if (!cancelled) setSuggested(people);
      } catch {
        if (!cancelled) setSuggested([]);
      }
    })();
    return () => { cancelled = true; };
  }, [getSuggestedUsers]);

  // ── Taste match ──────────────────────────────────────────────────────────
  const people = useMemo(
    () => [...mutualFollows, ...requests, ...pending, ...suggested, ...(results ?? [])],
    [mutualFollows, requests, pending, suggested, results],
  );

  useEffect(() => {
    if (!user?.id) return;
    const targets = Array.from(new Map(people.map((p) => [p.id, p])).values());
    if (targets.length === 0) return;

    let cancelled = false;
    void (async () => {
      let rows: SharedTasteRow[];
      try {
        rows = await fetchSharedTasteRows([user.id, ...targets.map((t) => t.id)]);
      } catch (err) {
        console.error('[friends] taste match fetch failed:', err);
        return;
      }
      if (cancelled) return;

      const bucketOf = new Map<string, { artists: Set<string>; titles: Set<string> }>();
      const ensure = (id: string) => {
        if (!bucketOf.has(id)) bucketOf.set(id, { artists: new Set<string>(), titles: new Set<string>() });
        return bucketOf.get(id)!;
      };

      for (const row of rows) {
        const bucket = ensure(row.sender_id);
        const artist = norm(row.artist);
        const title = norm(row.title);
        if (artist) bucket.artists.add(artist);
        if (title) bucket.titles.add(title);
      }

      const mine = ensure(user.id);
      const myFavArtist = norm(user.favorite_song?.artist);
      const myFavTitle = norm(user.favorite_song?.title);
      if (myFavArtist) mine.artists.add(myFavArtist);
      if (myFavTitle) mine.titles.add(myFavTitle);

      const next: Record<string, number | null> = {};
      for (const target of targets) {
        const theirs = ensure(target.id);
        const theirFavArtist = norm(target.favorite_song?.artist);
        const theirFavTitle = norm(target.favorite_song?.title);
        if (theirFavArtist) theirs.artists.add(theirFavArtist);
        if (theirFavTitle) theirs.titles.add(theirFavTitle);

        // Below a handful of known songs between the two of you, a percentage
        // is an artefact of the sample size. Say so rather than invent one:
        // this used to add a flat 24-32 so that nobody ever scored low, which
        // made the number mean nothing.
        const dataPoints = mine.artists.size + mine.titles.size + theirs.artists.size + theirs.titles.size;
        if (dataPoints < MIN_TASTE_DATA) { next[target.id] = null; continue; }

        const sameService = user.primary_service && target.primary_service === user.primary_service ? 1 : 0;
        next[target.id] = clampScore(
          jaccardScore(mine.artists, theirs.artists) * 62
          + jaccardScore(mine.titles, theirs.titles) * 24
          + sameService * 6
          + (myFavArtist && myFavArtist === theirFavArtist ? 8 : 0),
        );
      }

      if (!cancelled) setMatches(next);
    })();

    return () => { cancelled = true; };
  }, [user, people]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const add = async (target: User) => {
    try {
      await followUser(target.id);
      await refresh();
      toast.show({ kind: 'success', message: `Added ${target.display_name}` });
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not add them' });
    }
  };

  const relationshipOf = useCallback(
    (id: string) => relationshipFor(id, { friends: mutualFollows, requests, pending }),
    [mutualFollows, requests, pending],
  );

  const listFor = (t: Tab): User[] =>
    t === 'friends' ? [...mutualFollows, ...pending] : t === 'requests' ? requests : suggested;

  const shown = results ?? listFor(tab);

  const tabs = useMemo(() => [
    { id: 'friends' as const, label: 'Friends', count: mutualFollows.length },
    { id: 'requests' as const, label: 'Requests', count: requests.length },
    { id: 'suggested' as const, label: 'Suggested' },
  ], [mutualFollows.length, requests.length]);

  const emptyFor = (t: Tab) =>
    t === 'requests'
      ? {
          icon: 'mail-outline' as const,
          title: 'No requests',
          body: 'When someone adds you, they turn up here so you can add them back.',
        }
      : t === 'suggested'
        ? {
            icon: 'sparkles-outline' as const,
            title: 'Nobody to suggest yet',
            body: 'Museaic is new for you. Invite someone and suggestions follow from there.',
          }
        : {
            icon: 'people-outline' as const,
            title: 'No friends yet',
            body: 'Sharing takes two. Send someone your link and you can start swapping songs.',
          };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <AppBar
        title="People"
        right={<IconBtn name="person-add-outline" label="Add a friend" onPress={() => setInviteOpen(true)} />}
      />

      <View style={s.searchRow}>
        <View style={s.searchPill}>
          <Ionicons name="search-outline" size={17} color={colors.text3} />
          <TextInput
            style={s.searchInput}
            placeholder="Search by username"
            placeholderTextColor={colors.text4}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator size="small" color={colors.text3} /> : null}
          {query.length > 0 && !searching ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search" accessibilityRole="button">
              <Ionicons name="close-circle" size={17} color={colors.text4} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {results === null ? (
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
      ) : (
        <Txt variant="micro" color="text3" style={s.resultsLabel}>
          {shown.length === 0 ? 'No matches' : `${shown.length} ${shown.length === 1 ? 'result' : 'results'}`}
        </Txt>
      )}

      {loading && shown.length === 0 ? (
        <View style={s.loading}><ActivityIndicator color={colors.accent} size="large" /></View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(p) => p.id}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={results === null ? <InviteRow onPress={() => setInviteOpen(true)} /> : null}
          ListEmptyComponent={
            results !== null ? (
              <EmptyState
                compact
                icon="search-outline"
                title="Nobody by that name"
                body="Usernames are exact. Try the whole thing, or send them your link instead."
                action={{ label: 'Send my link', icon: 'share-outline', onPress: () => setInviteOpen(true) }}
              />
            ) : (
              <EmptyState
                {...emptyFor(tab)}
                action={{ label: 'Send my link', icon: 'share-outline', onPress: () => setInviteOpen(true) }}
              />
            )
          }
          renderItem={({ item }) => (
            <PersonRow
              person={item}
              relationship={relationshipOf(item.id)}
              match={matches[item.id]}
              onPress={() => setViewing(item.id)}
              onAdd={() => void add(item)}
              onSend={() => setSendTo(item)}
            />
          )}
        />
      )}

      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} username={user?.username} />
      <UserProfileModal userId={viewing} onClose={() => setViewing(null)} />
      <ShareComposer visible={sendTo !== null} recipient={sendTo} onClose={() => setSendTo(null)} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  searchRow: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, minHeight: 44,
  },
  searchInput: { flex: 1, ...type.body, color: colors.text },
  resultsLabel: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 110 },

  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs + 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.lg - 2,
  },
  stateTag: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line,
    paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.md,
  },

  inviteRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
  },
  inviteIcon: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
}));
