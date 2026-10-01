import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useSharedItems } from '../../hooks/useSharedItems';
import { useReactions } from '../../hooks/useReactions';
import { ReactionBar } from '../../components/ReactionBar';
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
            <CoverArt uri={item.cover_image_url} size={104} radius={12} />
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

  const isDrop = item.recipient_id === null;
  const isPlaylist = item.type === 'playlist';
  const action = isPlaylist
    ? `Add to ${viewerService ? serviceLabel(viewerService) : 'your library'}`
    : `Open in ${viewerService ? serviceLabel(viewerService) : 'your service'}`;

  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Avatar name={item.sender?.display_name ?? '?'} avatarUrl={item.sender?.avatar_url ?? null} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="captionStrong" numberOfLines={1}>{item.sender?.display_name ?? 'Someone'}</Txt>
          <Txt variant="micro" color="text3">
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

      {/* Art beside the title rather than above it. Full-bleed art pushed the
          title and the one real action below the fold, and at that size a
          left-aligned square read as a mistake rather than a choice. */}
      <TouchableOpacity
        style={s.cardBody}
        onPress={() => onOpen(item)}
        activeOpacity={0.8}
        accessibilityRole="button"
      >
        <CoverArt uri={item.cover_image_url} size={84} radius={12} />
        <View style={s.cardText}>
          <Txt variant="bodyStrong" numberOfLines={2}>{item.title}</Txt>
          <Txt variant="caption" color="text3" numberOfLines={1}>
            {isPlaylist ? `${item.tracks_count ?? 0} tracks` : item.artist}
          </Txt>
          {item.message ? (
            <Txt variant="caption" color="text2" numberOfLines={2} style={s.note}>{`“${item.message}”`}</Txt>
          ) : null}
        </View>
      </TouchableOpacity>

      <View style={s.cardFoot}>
        <ReactionBar
          counts={counts}
          mine={myReaction}
          onReact={onReact}
          collapsed
        />
        <TouchableOpacity style={s.play} onPress={() => onOpen(item)} activeOpacity={0.85} accessibilityRole="button">
          <Ionicons name={isPlaylist ? 'add' : 'open-outline'} size={14} color={colors.accentInk} />
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

  const viewerService = (user?.primary_service ?? null) as MusicService | null;

  // Drops come from people you follow, which realtime cannot express as a
  // filter, so returning to the tab is what picks them up.
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const open = useCallback((item: SharedItem) => {
    if (item.recipient_id) void markAsOpened(item.id);
    router.push(item.type === 'playlist' ? `/playlist/${item.id}` : `/song/${item.id}`);
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
  stripCard: { width: 104, gap: 2 },
  stripAvatar: {
    position: 'absolute', left: 6, top: 6,
    borderRadius: 16, borderWidth: 2, borderColor: colors.bg,
  },
  stripTitle: { marginTop: spacing.sm },

  // Card
  card: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm + 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  dropTag: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.accentSoft, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
  },
  cardBody: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  cardText: { flex: 1, minWidth: 0, gap: 2, paddingTop: 2 },
  note: { marginTop: spacing.xs, fontStyle: 'italic' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  play: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2,
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 1,
    maxWidth: 170,
  },
}));
