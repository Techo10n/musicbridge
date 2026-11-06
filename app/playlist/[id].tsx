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
import { DetailBar, DetailHero, Section } from '../../components/ShareDetail';
import { Button, EmptyState, Skeleton, Txt, useToast } from '../../components/ui';

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

  const close = () => router.back();

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <DetailBar onClose={close} />
        <View style={s.loading}>
          <Skeleton width={200} height={200} radius={8} />
          <Skeleton width={180} height={24} />
          <Skeleton width={120} height={16} />
        </View>
      </SafeAreaView>
    );
  }

  if (!item) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <DetailBar onClose={close} />
        <EmptyState
          icon="alert-circle-outline"
          title="This playlist is gone"
          body="The share may have been deleted."
          action={{ label: 'Go back', onPress: close }}
        />
      </SafeAreaView>
    );
  }

  const running = run?.state === 'waiting' || run?.state === 'processing';
  const done = run?.state === 'done' || alreadyAdded;
  const failed = run?.state === 'failed';
  const senderService = (item.sender?.primary_service ?? null) as MusicService | null;
  const yours = service ? serviceLabel(service) : 'your service';
  const pct = running && run.total ? Math.round((run.processed / run.total) * 100) : 0;

  // One action whose label and caption follow the conversion, rather than a
  // stack of status blocks that each appear and disappear.
  const caption = !service ? 'Connect a music service in Settings to add this.'
    : failed ? conversionErrorMessage(run.failure, service, yours)
    : running ? 'This keeps going if you leave.'
    : done ? (run?.matched != null ? `${run.matched} of ${total} songs added` : 'Already in your library')
    : senderService && senderService !== service ? `Shared from ${serviceLabel(senderService)}`
    : null;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <DetailBar onClose={close} />

      <FlatList
        data={tracks}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <DetailHero
              cover={item.cover_image_url}
              title={item.title}
              subtitle={`Playlist · ${total} ${total === 1 ? 'track' : 'tracks'}`}
            />

            <View style={s.action}>
              {!service ? null : running ? (
                <View
                  style={s.progress}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: run.total, now: run.processed }}
                >
                  <View style={[s.progressFill, { width: `${pct}%` }]} />
                  <Txt variant="bodyStrong">{`Matching ${run.processed} of ${run.total}`}</Txt>
                </View>
              ) : failed ? (
                <Button label="Try again" icon="refresh" fullWidth onPress={() => { dismiss(item.id); start(); }} />
              ) : done ? (
                playlistId ? <Button label={`Open in ${yours}`} icon="open-outline" fullWidth onPress={openPlaylist} /> : null
              ) : (
                <Button label={`Add to ${yours}`} icon="add" fullWidth disabled={total === 0} onPress={start} />
              )}
              {caption ? (
                <View style={s.captionRow}>
                  {done ? <Ionicons name="checkmark-circle" size={14} color={colors.success} /> : null}
                  <Txt variant="caption" color={failed ? 'danger' : 'text3'} align="center">{caption}</Txt>
                </View>
              ) : null}
            </View>

            <Section title="Tracks" right={String(total)} />
          </>
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
                    ? `Daily search limit reached. ${run.unmatched.length} left`
                    : `${run.unmatched.length} ${run.unmatched.length === 1 ? 'song' : 'songs'} could not be added`}
                </Txt>
              </View>
              <Txt variant="caption" color="text3" style={s.missedHint}>
                {run.quotaExhausted
                  ? `${yours} caps how many songs can be looked up per day. Open this again tomorrow to add the rest.`
                  : `No confident match on ${yours}. A close-but-wrong song is worse than a missing one, so these were skipped.`}
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
            <Txt variant="callout" color="text4" style={s.trackNum}>{String(index + 1)}</Txt>
            <View style={s.trackText}>
              <Txt variant="body" numberOfLines={1}>{track.title}</Txt>
              <Txt variant="caption" color="text3" numberOfLines={1}>{track.artist}</Txt>
            </View>
            {running && index < run.processed ? (
              <Ionicons name="checkmark" size={16} color={colors.text4} />
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
  loading: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  list: { paddingBottom: 130 },
  action: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.md },
  captionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  // Sized like a Button so the bar takes the button's place without a jump.
  progress: {
    minHeight: 48, borderRadius: radius.pill, overflow: 'hidden',
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  progressFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accentSoft },
  trackRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm + 2,
  },
  trackNum: { width: 22 },
  trackText: { flex: 1, minWidth: 0, gap: 1 },
  missed: {
    marginHorizontal: spacing.xl, marginTop: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
    padding: spacing.lg, gap: spacing.sm,
  },
  missedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  missedHint: { marginBottom: spacing.sm },
  missedRow: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
}));
