import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { conversionErrorMessage, useConversions } from '../../hooks/useConversions';
import { supabase } from '../../lib/supabase';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { serviceLabel } from '../../lib/services';
import { makeStyles, useTheme } from '../../lib/theme';
import { MusicService, SharedItem, Track } from '../../types';
import {
  AppBar, Avatar, Button, CoverArt, EmptyState, ServiceChip, Skeleton, Txt, useToast,
} from '../../components/ui';

/**
 * A shared playlist, and the machinery that puts it on your own service.
 *
 * A route rather than a modal because a conversion takes minutes: it has to
 * survive navigating away, and it has to be linkable from a notification.
 */
export default function PlaylistScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { conversions, convert, dismiss } = useConversions();

  const [item, setItem] = useState<SharedItem | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllMissed, setShowAllMissed] = useState(false);

  const service = (user?.primary_service ?? null) as MusicService | null;
  const run = id ? conversions[id] : undefined;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('shared_items')
          .select('id, sender_id, recipient_id, type, title, artist, cover_image_url, tracks, spotify_playlist_id, apple_music_playlist_id, apple_music_playlist_url, youtube_music_playlist_id, tracks_count, message, opened, conversion_status, created_at')
          .eq('id', id)
          .single();
        if (error) throw error;
        if (cancelled) return;

        const { data: sender } = await supabase
          .from('user_public_profiles')
          .select('id, username, display_name, avatar_url, primary_service')
          .eq('id', data.sender_id)
          .single();

        if (cancelled) return;
        setItem({ ...data, sender: sender ?? null } as SharedItem);
        setTracks((data.tracks as Track[] | null) ?? []);
      } catch (err) {
        console.error('[playlist] load failed:', err);
        if (!cancelled) setItem(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const alreadyAdded = item?.conversion_status === 'done';
  const total = item?.tracks_count ?? tracks.length;

  // A playlist that was converted before this session has no run to read from.
  const storedPlaylistId = useMemo(() => {
    if (!item || !service) return null;
    if (service === 'spotify') return item.spotify_playlist_id;
    if (service === 'apple_music') return item.apple_music_playlist_id;
    return item.youtube_music_playlist_id;
  }, [item, service]);

  const playlistId = run?.playlistId ?? storedPlaylistId;
  const playlistUrl = run?.playlistUrl ?? item?.apple_music_playlist_url ?? null;

  const openPlaylist = async () => {
    if (!playlistId || !service || !user) return;
    // Each service's own link builder tries the app's scheme before the web
    // URL, so this opens the app rather than a browser. None start playback.
    const urls = service === 'spotify'
      ? Spotify.getSpotifyPlaylistDeepLink(playlistId)
      : service === 'apple_music'
        ? await AppleMusic.resolveAppleMusicPlaylistLinks(user.id, playlistId, playlistUrl)
        : YouTubeMusic.getYouTubeMusicPlaylistDeepLink(playlistId);

    for (const url of urls) {
      try {
        if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; }
      } catch { continue; }
    }
    toast.show({ kind: 'error', message: `Could not open ${serviceLabel(service)}` });
  };

  const start = () => {
    if (!item || !service || total === 0) return;
    convert({ itemId: item.id, title: item.title, total, service });
  };

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <AppBar onBack={() => router.back()} title="" />
        <View style={s.loading}>
          <Skeleton width={170} height={170} radius={16} />
          <Skeleton width={190} height={20} />
          <Skeleton width={120} height={14} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <AppBar onBack={() => router.back()} title="" />
        <EmptyState
          icon="alert-circle-outline"
          title="This playlist is gone"
          body="The share may have been deleted."
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  const running = run?.state === 'waiting' || run?.state === 'processing';
  const done = run?.state === 'done' || alreadyAdded;
  const failed = run?.state === 'failed';
  const senderService = (item.sender?.primary_service ?? null) as MusicService | null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <AppBar onBack={() => router.back()} title="" />

      <FlatList
        data={tracks}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={s.hero}>
            <CoverArt uri={item.cover_image_url} size={170} radius={16} />
            <Txt variant="title1" align="center">{item.title}</Txt>
            <Txt variant="callout" color="text3" align="center">
              {`${total} ${total === 1 ? 'track' : 'tracks'}`}
            </Txt>

            {item.sender ? (
              <TouchableOpacity
                style={s.sender}
                onPress={() => router.push(`/user/${item.sender!.username}`)}
                accessibilityRole="button"
              >
                <Avatar name={item.sender.display_name} avatarUrl={item.sender.avatar_url} size={24} />
                <Txt variant="caption" color="text3">{`From ${item.sender.display_name}`}</Txt>
              </TouchableOpacity>
            ) : null}

            {senderService && service ? (
              <View style={s.flow}>
                <ServiceChip service={senderService} short />
                <Ionicons name="arrow-forward" size={14} color={colors.text3} />
                <ServiceChip service={service} short suffix="yours" />
              </View>
            ) : null}

            {item.message ? (
              <View style={s.note}>
                <Txt variant="callout" color="text2">{`“${item.message}”`}</Txt>
              </View>
            ) : null}

            {running ? (
              <View style={s.progressBlock}>
                <View style={s.progressHead}>
                  <Txt variant="bodyStrong">Matching tracks</Txt>
                  <Txt variant="caption" color="text3">{`${run.processed} / ${run.total}`}</Txt>
                </View>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${run.total ? Math.round((run.processed / run.total) * 100) : 0}%` }]} />
                </View>
                <Txt variant="caption" color="text3">
                  This keeps going if you leave. A pill at the bottom tracks it.
                </Txt>
              </View>
            ) : null}

            {failed ? (
              <View style={s.failBlock}>
                <Txt variant="callout" color="danger" align="center">
                  {conversionErrorMessage(run.failure, service, service ? serviceLabel(service) : 'your service')}
                </Txt>
                <Button label="Try again" onPress={() => { dismiss(item.id); start(); }} />
              </View>
            ) : null}

            {done ? (
              <View style={s.doneBlock}>
                <View style={s.doneRow}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                  <Txt variant="bodyStrong">
                    {run?.matched != null ? `${run.matched} of ${total} added` : 'Already in your library'}
                  </Txt>
                </View>
                {playlistId ? (
                  <Button label={`Open in ${service ? serviceLabel(service) : 'your service'}`} icon="open-outline" onPress={openPlaylist} />
                ) : null}
              </View>
            ) : null}

            {!running && !done && service ? (
              <Button
                label={`Add to ${serviceLabel(service)}`}
                icon="add"
                fullWidth
                disabled={total === 0}
                onPress={start}
                style={s.addBtn}
              />
            ) : null}

            {!service ? (
              <Txt variant="caption" color="text3" align="center">
                Connect a music service in Settings to add this.
              </Txt>
            ) : null}

            <Txt variant="micro" color="text3" style={s.tracksLabel}>Tracks</Txt>
          </View>
        }
        ListFooterComponent={
          done && run && run.unmatched.length > 0 ? (
            <View style={s.missed}>
              <View style={s.missedHead}>
                <Ionicons
                  name={run.quotaExhausted ? 'time-outline' : 'alert-circle-outline'}
                  size={15}
                  color={colors.text3}
                />
                <Txt variant="captionStrong" color="text2">
                  {run.quotaExhausted
                    ? `Daily search limit reached — ${run.unmatched.length} left`
                    : `${run.unmatched.length} ${run.unmatched.length === 1 ? 'song' : 'songs'} could not be added`}
                </Txt>
              </View>
              <Txt variant="caption" color="text3" style={s.missedHint}>
                {run.quotaExhausted
                  ? `${service ? serviceLabel(service) : 'That service'} caps how many songs can be looked up per day. Open this again tomorrow to add the rest.`
                  : `No confident match on ${service ? serviceLabel(service) : 'your service'}. A close-but-wrong song is worse than a missing one, so these were skipped.`}
              </Txt>
              {(showAllMissed ? run.unmatched : run.unmatched.slice(0, 4)).map((t, i) => (
                <View key={`${t.title}-${i}`} style={s.missedRow}>
                  <Txt variant="caption" color="text2" numberOfLines={1}>{t.title}</Txt>
                  {t.artist ? <Txt variant="caption" color="text4" numberOfLines={1}>{t.artist}</Txt> : null}
                </View>
              ))}
              {run.unmatched.length > 4 ? (
                <TouchableOpacity onPress={() => setShowAllMissed((v) => !v)} hitSlop={8} accessibilityRole="button">
                  <Txt variant="captionStrong" color="accent" align="center">
                    {showAllMissed ? 'Show less' : `Show all ${run.unmatched.length}`}
                  </Txt>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState compact icon="disc-outline" title="No tracks" body="This playlist arrived empty." />
        }
        renderItem={({ item: track, index }) => (
          <View style={s.trackRow}>
            <Txt variant="caption" color="text4" style={s.trackNum}>{String(index + 1).padStart(2, '0')}</Txt>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="callout" numberOfLines={1}>{track.title}</Txt>
              <Txt variant="caption" color="text3" numberOfLines={1}>{track.artist}</Txt>
            </View>
            {running && index < run.processed ? (
              <Txt variant="caption" color="text4">Checked</Txt>
            ) : running && index === run.processed ? (
              <Txt variant="caption" color="accent">Searching</Txt>
            ) : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxl },
  list: { paddingBottom: 130 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg },
  sender: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  flow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  note: {
    alignSelf: 'stretch', backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  addBtn: { alignSelf: 'stretch', marginTop: spacing.md },
  progressBlock: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  failBlock: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  doneBlock: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tracksLabel: { alignSelf: 'flex-start', marginTop: spacing.xl },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 2,
  },
  trackNum: { width: 24, textAlign: 'right' },
  missed: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
    padding: spacing.lg, gap: spacing.sm,
  },
  missedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  missedHint: { marginBottom: spacing.sm },
  missedRow: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
}));
