import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { SERVICES, serviceLabel } from '../../lib/services';
import { ShareDraft } from '../../lib/sharing';
import { makeStyles } from '../../lib/theme';
import { withTimeout } from '../../lib/utils';
import { MusicService, SharedItem } from '../../types';
import { ShareComposer } from '../../components/ShareComposer';
import { DetailBar, DetailHero } from '../../components/ShareDetail';
import { Button, EmptyState, IconBtn, Skeleton, Txt, useToast } from '../../components/ui';


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
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();

  const [item, setItem] = useState<SharedItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<MusicService | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);


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
          title="This song is gone"
          body="The share may have been deleted."
          action={{ label: 'Go back', onPress: close }}
        />
      </SafeAreaView>
    );
  }

  const others = SERVICES.filter((svc) => svc !== viewerService);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <DetailBar
        onClose={close}
        right={<IconBtn name="paper-plane-outline" label="Send to a friend" filled onPress={() => setComposerOpen(true)} />}
      />

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <DetailHero cover={item.cover_image_url} title={item.title} subtitle={item.artist ? `by ${item.artist}` : null} />

        <View style={s.action}>
          {viewerService ? (
            <Button
              label={`Open in ${serviceLabel(viewerService)}`}
              icon="play"
              fullWidth
              loading={opening === viewerService}
              onPress={() => openOn(viewerService)}
            />
          ) : null}
          {/* The other services as a quiet line, not a second row of buttons. */}
          <Txt variant="caption" color="text3" align="center">
            {opening && opening !== viewerService ? `Opening in ${serviceLabel(opening)}…` : (
              <>
                {viewerService ? 'Also open in ' : 'Open in '}
                {others.map((svc, i) => (
                  <Txt
                    key={svc}
                    variant="captionStrong"
                    color="text2"
                    onPress={opening ? undefined : () => openOn(svc)}
                    accessibilityRole="link"
                  >
                    {(i > 0 ? ' · ' : '') + serviceLabel(svc)}
                  </Txt>
                ))}
              </>
            )}
          </Txt>
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

const useStyles = makeStyles(({ colors, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  body: { paddingBottom: spacing.xxxl * 2 },
  action: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.md },
}));
