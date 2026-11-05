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
  AppBar, Avatar, CoverArt, EmptyState, IconBtn, SegmentedTabs, ServiceDot, Txt,
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

/**
 * The art sits centred on a tinted stage, with the sender pinned to its corner;
 * who-did-what reads underneath as one left-aligned sentence. The stage is kept
 * short so a card is never taller than half the screen and the action stays
 * in view.
 */
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
  const sender = item.sender?.display_name ?? 'Someone';
  const service = viewerService ? serviceLabel(viewerService) : null;
  const action = isPlaylist
    ? `Add to ${service ?? 'your library'}`
    : `Open in ${service ?? 'your service'}`;
  const verb = isDrop ? 'Dropped' : 'Sent you';
  const detail = isPlaylist ? `Playlist · ${item.tracks_count ?? 0} tracks` : item.artist;

  return (
    <View style={s.card}>
      <TouchableOpacity
        style={s.stage}
        onPress={() => onOpen(item)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${item.title} from ${sender}`}
      >
        <View style={s.cover}>
          <CoverArt uri={item.cover_image_url} size={COVER} radius={6} />
        </View>
        <View style={s.stageAvatar}>
          <Avatar name={sender} avatarUrl={item.sender?.avatar_url ?? null} size={34} />
          {item.sender?.primary_service ? (
            <View style={s.serviceBadge}>
              <ServiceDot service={item.sender.primary_service} size={10} />
            </View>
          ) : null}
        </View>
        {isDrop ? (
          <View style={s.dropTag}>
            <Ionicons name="radio-outline" size={12} color={colors.accent} />
            <Txt variant="captionStrong" color="accent">Everyone</Txt>
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={s.body}>
        <Txt variant="caption" color="text3" numberOfLines={1}>{`${sender} · ${timeAgo(item.created_at)}`}</Txt>
        <Txt variant="body" color="text2" numberOfLines={2} style={s.line}>
          {`${verb} `}
          <Txt variant="bodyStrong">{item.title}</Txt>
        </Txt>
        {detail ? <Txt variant="caption" color="text3" numberOfLines={1}>{detail}</Txt> : null}
        {item.message ? (
          <Txt variant="callout" color="text2" numberOfLines={3} style={s.note}>{`“${item.message}”`}</Txt>
        ) : null}

        <View style={s.foot}>
          <ReactionBar counts={counts} mine={myReaction} onReact={onReact} collapsed />
          <TouchableOpacity
            style={s.action}
            onPress={() => onOpen(item)}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Txt variant="captionStrong" color="accent" numberOfLines={1}>{action}</Txt>
            <Ionicons name="arrow-forward" size={13} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const COVER = 128;

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

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
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
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  stage: {
    height: COVER + spacing.xxxl * 1.5,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  cover: { borderRadius: 6, backgroundColor: colors.surfaceAlt, ...elevation.cover },
  stageAvatar: { position: 'absolute', left: spacing.md, top: spacing.md },
  serviceBadge: {
    position: 'absolute', right: -2, bottom: -2,
    padding: 2, borderRadius: 7, backgroundColor: colors.surfaceAlt,
  },
  dropTag: {
    position: 'absolute', right: spacing.md, top: spacing.md,
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs,
  },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, gap: 2 },
  line: { marginTop: 2 },
  note: { marginTop: spacing.sm },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: spacing.sm, marginTop: spacing.md,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
}));
