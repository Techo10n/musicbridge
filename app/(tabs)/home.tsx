import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useSharedItems } from '../../hooks/useSharedItems';
import { useReactions } from '../../hooks/useReactions';
import { PlaylistModal } from '../../components/PlaylistModal';
import { FirstShareCard } from '../../components/FirstShareCard';
import {
  AppBar, Avatar, CoverArt, EmptyState, IconBtn, SegmentedTabs, Txt,
} from '../../components/ui';
import { serviceLabel } from '../../lib/services';
import { makeStyles, useTheme } from '../../lib/theme';
import { timeAgo } from '../../lib/utils';
import { MusicService, SharedItem } from '../../types';

type Tab = 'friends' | 'foryou';
const TABS = [
  { id: 'friends', label: 'Friends' },
  { id: 'foryou', label: 'For you' },
] as const satisfies readonly { id: Tab; label: string }[];

const REACTIONS = ['🔥', '❤️', '🤯', '😮'];

// ─── New for you ──────────────────────────────────────────────────────────────

/** Unopened shares, as art you can flick through. The first thing on the screen. */
function NewForYou({ items, onOpen }: { items: SharedItem[]; onOpen: (item: SharedItem) => void }) {
  const s = useStyles();
  if (items.length === 0) return null;

  return (
    <View style={s.stripBlock}>
      <Txt variant="micro" color="text3" style={s.stripLabel}>
        {items.length === 1 ? 'New for you' : `New for you · ${items.length}`}
      </Txt>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={s.stripCard}
            onPress={() => onOpen(item)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${item.title} from ${item.sender?.display_name ?? 'someone'}`}
          >
            <CoverArt uri={item.cover_image_url} size={132} radius={14} />
            <View style={s.stripAvatar}>
              <Avatar name={item.sender?.display_name ?? '?'} avatarUrl={item.sender?.avatar_url ?? null} size={26} />
            </View>
            <Txt variant="captionStrong" numberOfLines={1} style={s.stripTitle}>{item.title}</Txt>
            <Txt variant="caption" color="text3" numberOfLines={1}>{item.sender?.display_name ?? 'Someone'}</Txt>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Feed card ────────────────────────────────────────────────────────────────

function FeedCard({
  item, onOpen, counts, myReaction, onReact, viewerService,
}: {
  item: SharedItem;
  onOpen: (item: SharedItem) => void;
  counts: Record<string, number>;
  myReaction: string | undefined;
  onReact: (emoji: string) => void;
  viewerService: MusicService | null;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  // Art is the hero, but not at the cost of pushing the title and the reactions
  // off the screen: cap it so one whole card fits above the fold.
  const art = Math.min(width - 32, Math.round(height * 0.38));

  const isDrop = item.recipient_id === null;
  const isPlaylist = item.type === 'playlist';
  const action = isPlaylist
    ? `Add to ${viewerService ? serviceLabel(viewerService) : 'your library'}`
    : `Play in ${viewerService ? serviceLabel(viewerService) : 'your service'}`;

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Avatar name={item.sender?.display_name ?? '?'} avatarUrl={item.sender?.avatar_url ?? null} size={34} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>{item.sender?.display_name ?? 'Someone'}</Txt>
          <Txt variant="caption" color="text3">
            {`${isDrop ? 'dropped this' : isPlaylist ? 'sent a playlist' : 'sent a song'} · ${timeAgo(item.created_at)}`}
          </Txt>
        </View>
        {isDrop ? (
          <View style={s.dropTag}>
            <Ionicons name="radio-outline" size={12} color={colors.accent} />
            <Txt variant="micro" color="accent">Everyone</Txt>
          </View>
        ) : null}
      </View>

      <TouchableOpacity onPress={() => onOpen(item)} activeOpacity={0.9} accessibilityRole="button">
        <CoverArt uri={item.cover_image_url} size={art} radius={16} />
      </TouchableOpacity>

      <View style={s.cardBody}>
        <Txt variant="title2" numberOfLines={1}>{item.title}</Txt>
        <Txt variant="callout" color="text3" numberOfLines={1}>
          {isPlaylist ? `${item.tracks_count ?? 0} tracks` : item.artist}
        </Txt>
      </View>

      {item.message ? (
        <View style={s.note}>
          <Txt variant="callout" color="text2">{`“${item.message}”`}</Txt>
        </View>
      ) : null}

      <View style={s.cardFoot}>
        <View style={s.reactions}>
          {REACTIONS.map((emoji) => {
            const count = counts[emoji] ?? 0;
            const mine = myReaction === emoji;
            return (
              <TouchableOpacity
                key={emoji}
                style={[s.reaction, mine && s.reactionMine]}
                onPress={() => onReact(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
              >
                <Txt variant="callout">{emoji}</Txt>
                {count > 0 ? <Txt variant="caption" color="text3">{String(count)}</Txt> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={s.play} onPress={() => onOpen(item)} activeOpacity={0.85} accessibilityRole="button">
          <Ionicons name={isPlaylist ? 'add' : 'play'} size={15} color={colors.accentInk} />
          <Txt variant="captionStrong" style={{ color: colors.accentInk }} numberOfLines={1}>{action}</Txt>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function Home() {
  const s = useStyles();
  const router = useRouter();
  const { user } = useAuth();
  const { items, unread, loading, refreshing, refresh, markAsOpened, unreadCount } = useSharedItems();

  const itemIds = useMemo(() => items.map((i) => i.id), [items]);
  const { reactions, myReactions, react } = useReactions(itemIds);

  const [tab, setTab] = useState<Tab>('friends');
  const [playlistItem, setPlaylistItem] = useState<SharedItem | null>(null);

  const viewerService = (user?.primary_service ?? null) as MusicService | null;

  // Drops come from people you follow, which realtime cannot express as a
  // filter, so returning to the tab is what picks them up.
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const open = useCallback((item: SharedItem) => {
    if (item.recipient_id) void markAsOpened(item.id);
    if (item.type === 'playlist') { setPlaylistItem(item); return; }
    router.push(`/song/${item.id}`);
  }, [markAsOpened, router]);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <AppBar
        logo
        right={
          <IconBtn
            name="notifications-outline"
            label="Activity"
            badge={unreadCount > 0}
            onPress={() => router.push('/(tabs)/notifications')}
          />
        }
      />

      <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'foryou' ? (
        <EmptyState
          icon="compass-outline"
          title="Discovery is coming"
          body="For now, everything from the people you follow is under Friends."
          action={{ label: 'Find people', icon: 'person-add', onPress: () => router.push('/(tabs)/friends') }}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          refreshing={refreshing}
          onRefresh={refresh}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <>
              <FirstShareCard userId={user?.id} onSend={() => router.push('/(tabs)/friends')} />
              <NewForYou items={unread} onOpen={open} />
            </>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                icon="musical-notes-outline"
                title="Nothing here yet"
                body="Send someone a song to start things off. Whatever comes back lands here."
                action={{ label: 'Send a song', icon: 'paper-plane', onPress: () => router.push('/(tabs)/friends') }}
              />
            )
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onOpen={open}
              counts={reactions[item.id] ?? {}}
              myReaction={myReactions[item.id]}
              onReact={(emoji) => react(item.id, emoji)}
              viewerService={viewerService}
            />
          )}
        />
      )}

      <PlaylistModal
        item={playlistItem}
        visible={playlistItem !== null}
        onClose={() => setPlaylistItem(null)}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 110 },

  // New for you
  stripBlock: { paddingTop: spacing.lg, gap: spacing.sm },
  stripLabel: { paddingHorizontal: spacing.lg },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.md },
  stripCard: { width: 132, gap: 2 },
  stripAvatar: {
    position: 'absolute', left: 6, top: 6,
    borderRadius: 16, borderWidth: 2, borderColor: colors.bg,
  },
  stripTitle: { marginTop: spacing.sm },

  // Card
  card: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  dropTag: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.accentSoft, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
  },
  cardBody: { gap: 2 },
  note: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reactions: { flexDirection: 'row', gap: spacing.xs + 2, flex: 1 },
  reaction: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: 'transparent',
  },
  reactionMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  play: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2,
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 1,
    maxWidth: 170,
  },
}));
