import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useReactions } from '../../hooks/useReactions';
import { supabase } from '../../lib/supabase';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { SERVICES, serviceLabel } from '../../lib/services';
import { ShareDraft } from '../../lib/sharing';
import { makeStyles, serviceColor, useTheme } from '../../lib/theme';
import { timeAgo, withTimeout } from '../../lib/utils';
import { MusicService, SharedItem } from '../../types';
import { ShareComposer } from '../../components/ShareComposer';
import {
  Avatar, Button, CoverArt, EmptyState, ServiceDot, Skeleton, Txt, useToast,
} from '../../components/ui';

const REACTIONS = ['🔥', '❤️', '🤯', '😮'];

/** The id the sender stored for a service, when they stored one. */
function storedIdFor(item: SharedItem, service: MusicService): string | null {
  if (service === 'spotify') return item.spotify_id;
  if (service === 'apple_music') return item.apple_music_id;
  return item.youtube_music_id;
}

/**
 * A song, and every way into it. Reached from the feed and from activity, so
 * opening a share finally lands somewhere in the app instead of bouncing
 * straight out to a streaming service.
 */
export default function SongScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [item, setItem] = useState<SharedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<MusicService | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const { reactions, myReactions, react } = useReactions(id ? [id] : []);
  const myReaction = id ? myReactions[id] : undefined;
  const counts = (id ? reactions[id] : undefined) ?? {};

  const viewerService = (user?.primary_service ?? null) as MusicService | null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('shared_items')
          .select('id, sender_id, recipient_id, type, title, artist, cover_image_url, spotify_id, apple_music_id, youtube_music_id, spotify_playlist_id, apple_music_playlist_id, apple_music_playlist_url, youtube_music_playlist_id, tracks_count, message, opened, conversion_status, created_at')
          .eq('id', id)
          .single();
        if (error) throw error;

        const { data: sender } = await supabase
          .from('user_public_profiles')
          .select('id, username, display_name, avatar_url, primary_service')
          .eq('id', data.sender_id)
          .single();

        if (!cancelled) setItem({ ...data, sender: sender ?? null } as SharedItem);
      } catch (err) {
        console.error('[song] load failed:', err);
        if (!cancelled) setItem(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Mark it read on arrival — reaching this screen is what "opened" means now.
  useEffect(() => {
    if (!item || item.opened || item.recipient_id !== user?.id) return;
    void supabase.from('shared_items').update({ opened: true }).eq('id', item.id);
  }, [item, user?.id]);

  const openOn = useCallback(async (service: MusicService) => {
    if (!item || !user) return;
    setOpening(service);
    try {
      const stored = storedIdFor(item, service);
      let links: string[] = [];

      switch (service) {
        case 'spotify': {
          const sid = stored ?? (item.title && item.artist
            ? await withTimeout(Spotify.searchTrack(user.id, item.title, item.artist), 10_000)
            : null);
          if (sid) links = Spotify.getSpotifyDeepLink(sid);
          break;
        }
        case 'apple_music':
          links = await withTimeout(
            AppleMusic.resolveAppleMusicTrackLinks(user.id, item.title, item.artist, stored),
            10_000,
          );
          break;
        case 'youtube_music':
          // A search hand-off, not a playback link: opening a shared song must
          // not interrupt whatever is already playing, and it avoids spending
          // a 100-unit search from a ~100/day budget just to build a URL.
          links = YouTubeMusic.getYouTubeMusicSearchLink(item.title, item.artist);
          break;
      }

      for (const link of links) {
        try { await Linking.openURL(link); return; } catch { continue; }
      }
      toast.show({ kind: 'error', message: `Make sure ${serviceLabel(service)} is installed` });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      toast.show({
        kind: 'error',
        message: code === 'timeout' ? 'That took too long. Try again.'
          : code === 'youtube_quota_exceeded' ? "YouTube's daily search limit is used up"
          : `Could not open on ${serviceLabel(service)}`,
      });
    } finally {
      setOpening(null);
    }
  }, [item, user, toast]);

  const draft: ShareDraft | null = item && viewerService
    ? {
        kind: 'song',
        title: item.title,
        artist: item.artist ?? '',
        coverUrl: item.cover_image_url,
        service: viewerService,
        serviceId: storedIdFor(item, viewerService) ?? '',
      }
    : null;

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.bar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close" accessibilityRole="button">
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={s.loading}>
          <Skeleton width={240} height={240} radius={20} />
          <Skeleton width={180} height={20} />
          <Skeleton width={120} height={14} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <View style={s.bar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close" accessibilityRole="button">
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon="alert-circle-outline"
          title="This song is gone"
          body="The share may have been deleted."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  const others = SERVICES.filter((svc) => svc !== viewerService);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close" accessibilityRole="button">
          <Ionicons name="chevron-down" size={26} color={colors.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setComposerOpen(true)} hitSlop={12} accessibilityLabel="Send to a friend" accessibilityRole="button">
          <Ionicons name="paper-plane-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <CoverArt uri={item.cover_image_url} size={260} radius={20} style={s.art} />

        <Txt variant="title1" align="center">{item.title}</Txt>
        {item.artist ? <Txt variant="body" color="text3" align="center">{item.artist}</Txt> : null}

        {item.sender ? (
          <View style={s.sender}>
            <Avatar name={item.sender.display_name} avatarUrl={item.sender.avatar_url} size={28} />
            <Txt variant="caption" color="text3">
              {`Sent by ${item.sender.display_name} · ${timeAgo(item.created_at)}`}
            </Txt>
          </View>
        ) : null}

        {item.message ? (
          <View style={s.note}>
            <Txt variant="callout" color="text2">{`“${item.message}”`}</Txt>
          </View>
        ) : null}

        <View style={s.reactions}>
          {REACTIONS.map((emoji) => {
            const count = counts[emoji] ?? 0;
            const mine = myReaction === emoji;
            return (
              <TouchableOpacity
                key={emoji}
                style={[s.reaction, mine && s.reactionMine]}
                onPress={() => react(item.id, emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
              >
                <Txt variant="body">{emoji}</Txt>
                {count > 0 ? <Txt variant="caption" color="text3">{String(count)}</Txt> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {viewerService ? (
          <Button
            label={`Open in ${serviceLabel(viewerService)}`}
            icon="play"
            fullWidth
            loading={opening === viewerService}
            onPress={() => openOn(viewerService)}
            style={s.primaryAction}
          />
        ) : null}

        <View style={s.othersBlock}>
          <Txt variant="micro" color="text3">Also open in</Txt>
          <View style={s.otherRow}>
            {others.map((svc) => (
              <TouchableOpacity
                key={svc}
                style={s.otherChip}
                onPress={() => openOn(svc)}
                disabled={opening !== null}
                accessibilityRole="button"
              >
                {opening === svc
                  ? <ActivityIndicator size="small" color={serviceColor(colors, svc)} />
                  : <ServiceDot service={svc} size={10} />}
                <Txt variant="captionStrong" color="text2">{serviceLabel(svc)}</Txt>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <ShareComposer
        visible={composerOpen}
        draft={draft}
        onClose={() => setComposerOpen(false)}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, height: 48,
  },
  loading: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxl },
  body: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.sm },
  art: { marginBottom: spacing.xl },
  sender: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  note: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    marginTop: spacing.sm, alignSelf: 'stretch',
  },
  reactions: { flexDirection: 'row', gap: spacing.sm, marginVertical: spacing.lg },
  reaction: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2,
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: 'transparent',
  },
  reactionMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  primaryAction: { alignSelf: 'stretch' },
  othersBlock: { alignSelf: 'stretch', marginTop: spacing.xl, gap: spacing.sm },
  otherRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  otherChip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg - 2, paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
}));
