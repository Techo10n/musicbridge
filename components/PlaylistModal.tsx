import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { SharedItem, Track } from '../types';
import { serviceName } from './ServiceBadge';
import { useAuth } from '../hooks/useAuth';

type ConversionState = 'idle' | 'waiting' | 'processing' | 'done' | 'failed';

interface PlaylistModalProps {
  item: SharedItem | null;
  visible: boolean;
  onClose: () => void;
}

export function PlaylistModal({ item, visible, onClose }: PlaylistModalProps) {
  const { user } = useAuth();

  const [conversionState, setConversionState] = useState<ConversionState>('idle');
  const [tracksProcessed, setTracksProcessed] = useState(0);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  // Hold a ref to the realtime channel so we can unsubscribe on cleanup or close
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Clean up the channel when the modal unmounts
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);

  if (!item) return null;

  const primaryService = user?.primary_service ?? null;
  const totalTracks = item.tracks?.length ?? 0;

  const handleClose = () => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setConversionState('idle');
    setTracksProcessed(0);
    setFailureReason(null);
    onClose();
  };

  const handleRetry = () => {
    setConversionState('idle');
    setTracksProcessed(0);
    setFailureReason(null);
  };

  const handleAddToService = async () => {
    if (!user || !primaryService || !item.tracks?.length) return;

    setConversionState('waiting');
    setTracksProcessed(0);
    setFailureReason(null);

    // Subscribe to realtime updates on this specific shared_item row.
    // The edge function writes progress (tracks_processed) and status
    // (conversion_status) back to this row as it works.
    let succeededViaRealtime = false;

    const channel = supabase
      .channel(`conversion:${item.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shared_items',
          filter: `id=eq.${item.id}`,
        },
        (payload) => {
          const row = payload.new as { conversion_status: string; tracks_processed: number };
          setTracksProcessed(row.tracks_processed ?? 0);

          if (row.conversion_status === 'processing') {
            setConversionState('processing');
          } else if (row.conversion_status === 'done') {
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
    const { data: fnData, error: fnError } = await supabase.functions.invoke(
      'convert-playlist',
      { body: { sharedItemId: item.id } },
    );

    // If the realtime event already marked it done, we're finished.
    if (succeededViaRealtime) return;

    // Handle the invoke response to get the specific failure reason.
    supabase.removeChannel(channel);
    channelRef.current = null;

    if (fnError) {
      // In Supabase JS v2, fnError.message is always a generic string.
      // The actual JSON body is in fnError.context (a Response object).
      try {
        const body = fnError.context ? await fnError.context.json() : {};
        setFailureReason(body.error ?? null);
      } catch {
        setFailureReason(null);
      }
      setConversionState('failed');
    } else if (fnData?.playlistId) {
      setConversionState('done');
    } else {
      setFailureReason(fnData?.error ?? null);
      setConversionState('failed');
    }
  };

  // ── Track list row ─────────────────────────────────────────────────────────

  const renderTrack = ({ item: track, index }: { item: Track; index: number }) => (
    <View style={styles.trackRow}>
      <Text style={styles.trackIndex}>{index + 1}</Text>
      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
        <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
      </View>
    </View>
  );

  // ── Footer ─────────────────────────────────────────────────────────────────

  const renderFooter = () => {
    if (!primaryService) return null;

    if (conversionState === 'idle') {
      return (
        <TouchableOpacity style={styles.addButton} onPress={handleAddToService} activeOpacity={0.8}>
          <Text style={styles.addButtonText}>Add to {serviceName(primaryService)}</Text>
        </TouchableOpacity>
      );
    }

    if (conversionState === 'done') {
      return (
        <View style={styles.doneContainer}>
          <Text style={styles.doneText}>
            ✓ Added to {serviceName(primaryService)}!
            {'\n'}
            <Text style={styles.doneSubtext}>
              {tracksProcessed} of {totalTracks} tracks matched
            </Text>
          </Text>
          <TouchableOpacity style={styles.closeActionButton} onPress={handleClose} activeOpacity={0.8}>
            <Text style={styles.closeActionText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (conversionState === 'failed') {
      let errorMsg = 'Conversion failed. Check your connection and try again.';
      if (failureReason === 'spotify_rate_limit_exceeded') {
        errorMsg =
          "Spotify's daily search quota has been reached (Development Mode limit). Please wait ~12 hours and try again.";
      } else if (failureReason?.includes('Apple Music')) {
        errorMsg = 'Apple Music conversion is not yet supported.';
      } else if (failureReason === 'No tracks could be matched on the destination service') {
        errorMsg = `None of the tracks could be found on ${serviceName(primaryService)}.`;
      } else if (failureReason === 'spotify_token_refresh_failed') {
        errorMsg = 'Your Spotify session has expired. Go to Profile and reconnect Spotify.';
      } else if (failureReason === 'not_connected') {
        errorMsg = `You are not connected to ${serviceName(primaryService ?? 'spotify')}. Go to Profile and connect your account.`;
      } else if (failureReason === 'playlist_creation_failed') {
        errorMsg = `Tracks were found but the playlist couldn't be created on ${serviceName(primaryService)}. Try reconnecting ${serviceName(primaryService)} in Profile.`;
      }
      return (
        <View style={styles.failedContainer}>
          <Text style={styles.failedText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // 'waiting' or 'processing'
    const progress = totalTracks > 0 ? tracksProcessed / totalTracks : 0;
    const statusText =
      conversionState === 'waiting'
        ? 'Starting conversion…'
        : `Finding tracks… ${tracksProcessed} of ${totalTracks}`;

    return (
      <View style={styles.progressContainer}>
        <Text style={styles.progressText}>{statusText}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.progressHint}>
          This may take a minute for large playlists
        </Text>
      </View>
    );
  };

  // ── Modal ──────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={item.cover_image_url ? { uri: item.cover_image_url } : require('../assets/icon.png')}
            style={styles.cover}
          />
          <View style={styles.headerInfo}>
            <Text style={styles.playlistTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.trackCount}>
              {totalTracks} tracks · from {item.sender?.display_name ?? 'someone'}
            </Text>
            {item.message && (
              <Text style={styles.message} numberOfLines={2}>"{item.message}"</Text>
            )}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Track list */}
        <FlatList
          data={item.tracks ?? []}
          renderItem={renderTrack}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No tracks in this playlist</Text>
          }
        />

        {/* Conversion footer */}
        <View style={styles.footer}>{renderFooter()}</View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
  },
  headerInfo: {
    flex: 1,
  },
  playlistTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  trackCount: {
    color: '#888',
    fontSize: 13,
    marginBottom: 4,
  },
  message: {
    color: '#666',
    fontSize: 12,
    fontStyle: 'italic',
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    color: '#666',
    fontSize: 18,
  },
  list: {
    flex: 1,
  },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
  },
  trackIndex: {
    color: '#555',
    fontSize: 14,
    width: 24,
    textAlign: 'center',
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  trackArtist: {
    color: '#888',
    fontSize: 13,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 58,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  // ── Idle state ─────────────────────────────────────────────────────────────
  addButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  // ── Progress state ─────────────────────────────────────────────────────────
  progressContainer: {
    gap: 10,
  },
  progressText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  progressHint: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
  },
  // ── Done state ─────────────────────────────────────────────────────────────
  doneContainer: {
    gap: 12,
    alignItems: 'center',
  },
  doneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  doneSubtext: {
    color: '#888',
    fontSize: 13,
    fontWeight: '400',
  },
  closeActionButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  closeActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // ── Failed state ───────────────────────────────────────────────────────────
  failedContainer: {
    gap: 12,
    alignItems: 'center',
  },
  failedText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  retryText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
});
