import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { SharedItem, Track } from '../types';
import { serviceName } from './ServiceBadge';
import { useAuth } from '../hooks/useAuth';
import * as AppleMusic from '../lib/appleMusic';
import { colors } from '../lib/theme';

type ConversionState = 'idle' | 'waiting' | 'processing' | 'done' | 'failed';

/** Stable empty reference so an unloaded item does not churn referential equality. */
const EMPTY_TRACKS: Track[] = [];

interface PlaylistModalProps {
  item: SharedItem | null;
  visible: boolean;
  onClose: () => void;
}

interface ConvertPlaylistResult {
  playlistId?: string;
  playlistUrl?: string | null;
  /** How many tracks actually resolved on the destination service. */
  matchedTracks?: number;
  /** How many were attempted. */
  totalTracks?: number;
  /** The tracks with no match on the destination service. */
  unmatchedTracks?: { title: string; artist: string }[];
  error?: string;
}

export function PlaylistModal({ item, visible, onClose }: PlaylistModalProps) {
  const { user } = useAuth();

  const [conversionState, setConversionState] = useState<ConversionState>('idle');
  const [tracksProcessed, setTracksProcessed] = useState(0);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [createdPlaylistId, setCreatedPlaylistId] = useState<string | null>(null);
  const [createdPlaylistUrl, setCreatedPlaylistUrl] = useState<string | null>(null);
  // Tracks that actually resolved. This is NOT the progress counter: progress
  // counts tracks *examined*, and a track that found no match on the
  // destination service still advances it. Reporting progress as "matched"
  // claimed 16/16 for a playlist that ended up with 10 songs.
  const [matchedTracks, setMatchedTracks] = useState<number | null>(null);
  const [unmatchedTracks, setUnmatchedTracks] = useState<{ title: string; artist: string }[]>([]);
  // `tracks` is excluded from the inbox query (it is a large jsonb payload), so
  // the detail view fetches it for the single item it is showing. The loaded
  // payload is stored *with* the id it belongs to, and staleness is derived
  // rather than cleared by an effect: that avoids a setState-in-effect reset
  // and, more importantly, makes it impossible to show one item's tracks under
  // another item while a fetch is in flight.
  const [loadedTracks, setLoadedTracks] = useState<{ itemId: string; tracks: Track[] } | null>(null);

  // Hold a ref to the realtime channel so we can unsubscribe on cleanup or close
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const convertingItemIdRef = useRef<string | null>(null);

  // Clean up the channel when the modal unmounts
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
  const primaryService = user?.primary_service ?? null;
  const itemId = item?.id;
  const itemType = item?.type;
  // Only treat the loaded payload as this item's when the ids agree.
  const tracks = loadedTracks && loadedTracks.itemId === itemId ? loadedTracks.tracks : EMPTY_TRACKS;
  const totalTracks = item?.tracks_count ?? tracks.length;
  const alreadyInLibrary = item?.conversion_status === 'done';
  const appleMusicHasDirectPlaylistUrl = primaryService === 'apple_music' && !!createdPlaylistUrl;

  useEffect(() => {
    if (!item || !primaryService) return;

    const isFreshConversion = convertingItemIdRef.current === item.id;

    if (item.conversion_status === 'done' && !isFreshConversion) {
      setConversionState('idle');
      setTracksProcessed(item.tracks_count ?? 0);
      setFailureReason(null);
      setCreatedPlaylistId(
        primaryService === 'spotify'
            ? item.spotify_playlist_id
            : primaryService === 'apple_music'
              ? item.apple_music_playlist_id
              : item.youtube_music_playlist_id,
      );
      setCreatedPlaylistUrl(primaryService === 'apple_music' ? item.apple_music_playlist_url ?? null : null);
      return;
    }

    if (!isFreshConversion && item.conversion_status !== 'done') {
      setConversionState('idle');
      setTracksProcessed(0);
      setFailureReason(null);
      setCreatedPlaylistId(null);
      setCreatedPlaylistUrl(null);
    }
  }, [item, primaryService]);

  // Load the track payload for this item only while the modal is open.
  //
  // Keyed on primitives, never on `item` itself: the inbox refetches on every
  // realtime update and hands down a fresh object each time, which would
  // re-run this effect, cancel the in-flight request, and restart it — leaving
  // the list permanently empty if the churn outpaces the fetch.
  useEffect(() => {
    if (!visible || !itemId || itemType !== 'playlist') return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('shared_items')
        .select('tracks')
        .eq('id', itemId)
        .single();
      if (cancelled) return;
      if (error) {
        console.error(`[PlaylistModal] track fetch failed for ${itemId}: ${error.message}`);
        return;
      }
      setLoadedTracks({ itemId, tracks: (data?.tracks as Track[] | null) ?? [] });
    })();
    return () => { cancelled = true; };
  }, [visible, itemId, itemType]);

  if (!item) return null;

  const handleClose = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    convertingItemIdRef.current = null;
    setConversionState('idle');
    setTracksProcessed(0);
    setFailureReason(null);
    setCreatedPlaylistId(null);
    setCreatedPlaylistUrl(null);
    onClose();
  };

  const handleRetry = () => {
    convertingItemIdRef.current = null;
    setConversionState('idle');
    setTracksProcessed(0);
    setFailureReason(null);
    setCreatedPlaylistId(null);
    setCreatedPlaylistUrl(null);
  };

  const handleRunInBackground = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    convertingItemIdRef.current = null;
    onClose();
  };

  const openCreatedPlaylist = async () => {
    if (!createdPlaylistId || !primaryService) return;
    if (primaryService === 'apple_music' && !user?.id) return;
    const urls =
      primaryService === 'spotify'
        ? [`spotify:playlist:${createdPlaylistId}`, `https://open.spotify.com/playlist/${createdPlaylistId}`]
        : primaryService === 'apple_music'
          ? await AppleMusic.resolveAppleMusicPlaylistLinks(user?.id ?? '', createdPlaylistId, createdPlaylistUrl)
          : [`https://music.youtube.com/playlist?list=${createdPlaylistId}`];
    console.log('[PlaylistModal] opening created playlist', {
      primaryService,
      createdPlaylistId,
      createdPlaylistUrl,
      urls,
    });
    for (const url of urls) {
      try {
        if (await Linking.canOpenURL(url)) { await Linking.openURL(url); return; }
      } catch {
        continue; // try the next candidate URL
      }
    }
  };

  const handleAddToService = async () => {
    if (!user || !primaryService || !totalTracks) return;

    convertingItemIdRef.current = item.id;
    setConversionState('waiting');
    setTracksProcessed(0);
    setFailureReason(null);

    // Subscribe to the narrow conversion_progress row rather than the shared_item
    // itself — the latter carries the whole tracks jsonb, so broadcasting it on
    // every progress tick was the bulk of the load (see migration 011).
    // INSERT as well as UPDATE: the first write for an item is an upsert-insert.
    let succeededViaRealtime = false;

    const channel = supabase
      .channel(`conversion:${item.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversion_progress',
          filter: `shared_item_id=eq.${item.id}`,
        },
        (payload) => {
          const row = payload.new as { status: string; tracks_processed: number };
          setTracksProcessed(row.tracks_processed ?? 0);

          if (row.status === 'processing') {
            setConversionState('processing');
          } else if (row.status === 'done') {
            succeededViaRealtime = true;
            setConversionState('done');
            supabase.removeChannel(channel);
            channelRef.current = null;
          }
          // Don't handle 'failed' here — let the HTTP response set the reason first.
        },
      )
      .subscribe();

    channelRef.current = channel;

    // Invoke the edge function. The client's JWT is sent automatically.
    // This call blocks until the function returns, but progress is visible
    // in real-time via the Supabase channel above.
    const { data: fnData, error: fnError } = await supabase.functions.invoke<ConvertPlaylistResult>(
      'convert-playlist',
      { body: { sharedItemId: item.id } },
    );

    // Capture the created playlist ID from the response regardless of which path finished first.
    if (fnData?.playlistId) {
      setCreatedPlaylistId(fnData.playlistId);
      setCreatedPlaylistUrl(fnData.playlistUrl ?? null);
      if (typeof fnData.matchedTracks === 'number') setMatchedTracks(fnData.matchedTracks);
      if (fnData.unmatchedTracks) setUnmatchedTracks(fnData.unmatchedTracks);
    }

    // If the realtime event already marked it done, we're finished.
    if (succeededViaRealtime) return;

    // Handle the invoke response to get the specific failure reason.
    supabase.removeChannel(channel);
    channelRef.current = null;

    if (fnError) {
      convertingItemIdRef.current = null;
      const ctx = fnError.context;
      let reason: string | null = null;
      let rawBody = '';
      try {
        if (ctx && typeof ctx.text === 'function') {
          rawBody = await ctx.text();
          try {
            const body = JSON.parse(rawBody);
            reason = typeof body?.error === 'string' ? body.error : null;
            if (body?.detail) console.error('[PlaylistModal] failure detail:', body.detail);
          } catch {
            reason = rawBody.length > 0 && rawBody.length < 300 ? rawBody : null;
          }
        }
      } catch (readErr) {
        rawBody = `(read error: ${readErr})`;
      }
      console.error(`[PlaylistModal] HTTP ${ctx?.status ?? '?'} | body: ${rawBody || '(empty)'} | reason: ${reason}`);
      setFailureReason(reason);
      setConversionState('failed');
    } else if (fnData?.playlistId) {
      setCreatedPlaylistId(fnData.playlistId);
      setCreatedPlaylistUrl(fnData.playlistUrl ?? null);
      if (typeof fnData.matchedTracks === 'number') setMatchedTracks(fnData.matchedTracks);
      if (fnData.unmatchedTracks) setUnmatchedTracks(fnData.unmatchedTracks);
      setConversionState('done');
    } else {
      convertingItemIdRef.current = null;
      console.error('[PlaylistModal] unexpected fnData:', fnData);
      setFailureReason(fnData?.error ?? null);
      setConversionState('failed');
    }
  };

  // ── Resolve error message ─────────────────────────────────────────────────
  const getErrorMessage = () => {
    if (!primaryService) return 'No service connected.';
    if (failureReason === 'spotify_rate_limit_exceeded') return "Spotify's daily quota reached. Try again in ~12 hours.";
    if (failureReason === 'apple_music_token_unavailable') return 'Apple Music auth unavailable. Reconnect in Profile.';
    if (failureReason === 'No tracks could be matched on the destination service') return `None of the tracks found on ${serviceName(primaryService)}.`;
    if (failureReason === 'spotify_token_refresh_failed') return 'Spotify session expired. Reconnect in Profile.';
    if (failureReason === 'not_connected') return `Not connected to ${serviceName(primaryService)}. Go to Profile.`;
    if (failureReason === 'spotify_permission_denied') return 'Missing Spotify permission. Disconnect and reconnect Spotify.';
    // Auth/scope/quota failures during track search. These abort the whole run,
    // so they must not be reported as "no tracks matched" — see gotchas.md.
    if (failureReason?.endsWith('_auth_failed')) return `${serviceName(primaryService)} session expired. Reconnect in Profile.`;
    if (failureReason?.endsWith('_permission_denied')) return `Missing ${serviceName(primaryService)} permission. Disconnect and reconnect in Profile.`;
    if (failureReason?.endsWith('_quota_exceeded')) return `${serviceName(primaryService)}'s daily quota is exhausted. Try again tomorrow.`;
    if (failureReason === 'tracks_not_added') return `Playlist created but no tracks added. Try reconnecting ${serviceName(primaryService)}.`;
    if (failureReason === 'playlist_creation_failed') return `Playlist couldn't be created on ${serviceName(primaryService)}.`;
    if (failureReason) return `Conversion failed: ${failureReason}`;
    return 'Conversion failed. Check connection and try again.';
  };

  // ── Modal ──────────────────────────────────────────────────────────────────

  const isConverting = conversionState === 'waiting' || conversionState === 'processing';
  const progress = totalTracks > 0 ? tracksProcessed / totalTracks : 0;
  const senderSvc = (item.sender?.primary_service as string | null) ?? 'spotify';
  const senderSvcLabel = serviceName(senderSvc as any);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.fg2} />
          </TouchableOpacity>

          <View style={styles.heroCenter}>
            {item.cover_image_url
              ? <Image source={{ uri: item.cover_image_url }} style={styles.heroCover} />
              : <View style={styles.heroCoverFallback}><Ionicons name="musical-notes" size={48} color={colors.fg4} /></View>
            }
            {item.sender && (
              <Text style={styles.heroSharedBy}>Shared by {item.sender.display_name}</Text>
            )}
            <Text style={styles.heroTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.heroMeta}>
              {totalTracks} tracks{item.message ? ` · "${item.message}"` : ''}
            </Text>

            {/* Service direction chips */}
            <View style={styles.svcFlow}>
              <View style={styles.svcChip}>
                <View style={[styles.svcDot, { backgroundColor: senderSvc === 'spotify' ? '#1DB954' : senderSvc === 'apple_music' ? '#fc3c44' : '#FF0000' }]} />
                <Text style={styles.svcChipText}>{senderSvcLabel}</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={colors.fg3} />
              {primaryService && (
                <View style={styles.svcChip}>
                  <View style={[styles.svcDot, { backgroundColor: primaryService === 'spotify' ? '#1DB954' : primaryService === 'apple_music' ? '#fc3c44' : '#FF0000' }]} />
                  <Text style={styles.svcChipText}>{serviceName(primaryService)} · Yours</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── Conversion diagram (shown during/after conversion) ── */}
        {isConverting && (
          <View style={styles.conversionDiagram}>
            <View style={styles.conversionSide}>
              <View style={[styles.convDot, { backgroundColor: senderSvc === 'apple_music' ? '#fc3c44' : '#1DB954' }]} />
              <Text style={styles.convLabel}>Source</Text>
            </View>
            <View style={styles.convArrow}>
              <View style={styles.convArrowLine} />
              <View style={styles.convShuffleBtn}>
                <Ionicons name="shuffle" size={14} color={colors.primary} />
              </View>
            </View>
            <View style={styles.conversionSide}>
              <View style={[styles.convDot, { backgroundColor: primaryService === 'spotify' ? '#1DB954' : primaryService === 'apple_music' ? '#fc3c44' : '#FF0000' }]} />
              <Text style={styles.convLabel}>Yours</Text>
            </View>
          </View>
        )}

        {/* ── Progress bar ── */}
        {isConverting && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Matching tracks</Text>
              <Text style={styles.progressCount}>{tracksProcessed} / {totalTracks}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
            </View>
          </View>
        )}

        {/* ── Track resolution list (during conversion) or plain track list ── */}
        <FlatList
          data={tracks}
          keyExtractor={(_, i) => String(i)}
          style={{ flex: 1 }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No tracks in this playlist</Text>}
          renderItem={({ item: track, index }) => {
            // Only claim a per-track match when every track resolved; otherwise
            // the service told us a total, not which tracks it was.
            const allResolved = matchedTracks === null || matchedTracks >= totalTracks;
            const status: 'matched' | 'checked' | 'active' | 'pending' | 'queued' =
              isConverting
                ? index < tracksProcessed ? 'checked'
                : index === tracksProcessed ? 'active'
                : 'queued'
              : conversionState === 'done' && allResolved ? 'matched' : 'pending';
            return (
              <View style={styles.trackRow}>
                <Text style={styles.trackNum}>{String(index + 1).padStart(2, '0')}</Text>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
                  <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
                </View>
                {isConverting || conversionState === 'done' ? (
                  <TrackStatusBadge status={status} />
                ) : null}
              </View>
            );
          }}
        />

        {/* ── Footer ── */}
        <View style={styles.footer}>
          {/* Idle: show Add button */}
          {conversionState === 'idle' && !alreadyInLibrary && primaryService && (
            <TouchableOpacity style={styles.addBtn} onPress={handleAddToService} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color={colors.primaryInk} />
              <Text style={styles.addBtnText}>Add to your {serviceName(primaryService)}</Text>
            </TouchableOpacity>
          )}

          {/* Already in library */}
          {alreadyInLibrary && conversionState === 'idle' && primaryService && (
            <View style={styles.doneRow}>
              <View style={styles.doneCheck}><Ionicons name="checkmark" size={16} color={colors.primaryInk} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Already in your library</Text>
                <Text style={styles.doneSub}>{serviceName(primaryService)} · {matchedTracks ?? tracksProcessed} tracks</Text>
              </View>
              {createdPlaylistId && (
                <TouchableOpacity style={styles.openSvcBtn} onPress={openCreatedPlaylist} activeOpacity={0.85}>
                  <Text style={styles.openSvcBtnText}>Open</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Converting */}
          {isConverting && (
            <TouchableOpacity style={styles.bgBtn} onPress={handleRunInBackground} activeOpacity={0.8}>
              <Text style={styles.bgBtnText}>Run in background</Text>
            </TouchableOpacity>
          )}

          {/* Done */}
          {conversionState === 'done' && primaryService && (
            <View style={styles.doneRow}>
              <View style={styles.doneCheck}><Ionicons name="checkmark" size={16} color={colors.primaryInk} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Added to {serviceName(primaryService)}!</Text>
                <Text style={styles.doneSub}>
                  {matchedTracks ?? tracksProcessed} of {totalTracks} tracks matched
                </Text>
                {unmatchedTracks.length > 0 && (
                  <View style={styles.missedBox}>
                    <Text style={styles.missedTitle}>
                      Couldn&apos;t find {unmatchedTracks.length} on {serviceName(primaryService)}
                    </Text>
                    {unmatchedTracks.map((t, i) => (
                      <Text key={`${t.title}-${i}`} style={styles.missedRow} numberOfLines={1}>
                        {t.title}{t.artist ? ` · ${t.artist}` : ''}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
              {createdPlaylistId && (
                <TouchableOpacity style={styles.openSvcBtn} onPress={openCreatedPlaylist} activeOpacity={0.85}>
                  <Text style={styles.openSvcBtnText}>
                    {primaryService === 'apple_music' && !appleMusicHasDirectPlaylistUrl ? 'Open Library' : 'Open'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Failed */}
          {conversionState === 'failed' && (
            <View style={styles.failedRow}>
              <Text style={styles.failedText}>{getErrorMessage()}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Track status badge ───────────────────────────────────────────────────────
function TrackStatusBadge({ status }: { status: 'matched' | 'checked' | 'active' | 'pending' | 'queued' }) {
  // "Checked" means searched, outcome not yet known. The conversion reports how
  // many tracks it has examined, not which ones resolved, so claiming "Matched"
  // per track while it runs asserts something we cannot know yet.
  if (status === 'checked') {
    return <Text style={tsBadge.queued}>Checked</Text>;
  }
  if (status === 'matched') {
    return (
      <View style={tsBadge.matched}>
        <Ionicons name="checkmark" size={12} color={colors.primaryInk} />
        <Text style={tsBadge.matchedText}>Matched</Text>
      </View>
    );
  }
  if (status === 'active') {
    return (
      <View style={tsBadge.active}>
        <View style={tsBadge.activeDot} />
        <Text style={tsBadge.activeText}>Searching</Text>
      </View>
    );
  }
  if (status === 'queued') {
    return <Text style={tsBadge.queued}>Queued</Text>;
  }
  return null;
}

const tsBadge = StyleSheet.create({
  matched: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(124,91,244,0.15)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  matchedText: { fontSize: 11, color: colors.primary, fontWeight: '600' },
  active: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.violet },
  activeText: { fontSize: 11, color: colors.violet, fontWeight: '600' },
  queued: { fontSize: 11, color: colors.fg3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Hero
  hero: {
    backgroundColor: colors.bgElev,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  backBtn: { padding: 4, marginBottom: 12 },
  heroCenter: { alignItems: 'center', gap: 8 },
  heroCover: { width: 160, height: 160, borderRadius: 16, backgroundColor: colors.bgCard },
  heroCoverFallback: {
    width: 160, height: 160, borderRadius: 16,
    backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  heroSharedBy: { fontSize: 11, color: colors.primary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: colors.fg, letterSpacing: -0.4, textAlign: 'center' },
  heroMeta: { fontSize: 13, color: colors.fg2, textAlign: 'center' },
  svcFlow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  svcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.bgCard, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.line,
  },
  svcDot: { width: 8, height: 8, borderRadius: 4 },
  svcChipText: { fontSize: 12, color: colors.fg2, fontWeight: '600' },

  // Conversion diagram
  conversionDiagram: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginVertical: 12,
    backgroundColor: colors.bgCard, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.line,
  },
  conversionSide: { alignItems: 'center', gap: 4 },
  convDot: { width: 32, height: 32, borderRadius: 16 },
  convLabel: { fontSize: 11, color: colors.fg3 },
  convArrow: {
    flex: 1, position: 'relative', height: 32,
    alignItems: 'center', justifyContent: 'center',
  },
  convArrowLine: {
    position: 'absolute', left: 0, right: 0,
    height: 2, backgroundColor: colors.line2,
  },
  convShuffleBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.bgElev, borderWidth: 2, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Progress
  progressSection: { paddingHorizontal: 20, paddingBottom: 8 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  progressLabel: { fontSize: 15, fontWeight: '600', color: colors.fg },
  progressCount: { fontSize: 13, color: colors.fg3, fontVariant: ['tabular-nums'] },
  progressBar: { height: 6, borderRadius: 3, backgroundColor: colors.bgCard, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },

  // Track list
  trackRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11, gap: 12 },
  trackNum: { width: 26, fontSize: 11, color: colors.fg3, textAlign: 'right', fontVariant: ['tabular-nums'] },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 14, fontWeight: '500', color: colors.fg, marginBottom: 2 },
  trackArtist: { fontSize: 12, color: colors.fg3 },
  sep: { height: 1, backgroundColor: colors.line, marginLeft: 58 },
  emptyText: { color: colors.fg3, fontSize: 14, textAlign: 'center', marginTop: 40 },

  // Footer
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 15,
  },
  addBtnText: { color: colors.primaryInk, fontSize: 16, fontWeight: '700' },

  doneRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  doneCheck: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  doneTitle: { fontSize: 15, fontWeight: '700', color: colors.fg, marginBottom: 2 },
  doneSub: { fontSize: 12, color: colors.fg3 },
  missedBox: {
    marginTop: 10, alignSelf: 'stretch', gap: 2,
    backgroundColor: colors.bgCard, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
  },
  missedTitle: { fontSize: 11, fontWeight: '600', color: colors.fg2, marginBottom: 2 },
  missedRow: { fontSize: 11, color: colors.fg3 },
  openSvcBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  openSvcBtnText: { color: colors.primaryInk, fontSize: 13, fontWeight: '700' },

  bgBtn: { backgroundColor: colors.bgCard, borderRadius: 999, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  bgBtnText: { color: colors.fg2, fontSize: 15, fontWeight: '600' },

  failedRow: { gap: 12 },
  failedText: { color: colors.coral, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  retryBtnText: { color: colors.primaryInk, fontSize: 15, fontWeight: '700' },
});
