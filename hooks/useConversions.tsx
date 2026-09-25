import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MusicService } from '../types';

export type ConversionState = 'waiting' | 'processing' | 'done' | 'failed';

export interface Conversion {
  itemId: string;
  title: string;
  state: ConversionState;
  /** Tracks examined so far. Not the same as tracks matched. */
  processed: number;
  total: number;
  /** How many actually resolved on the destination service, once known. */
  matched: number | null;
  unmatched: { title: string; artist: string }[];
  /** True when the run stopped because the daily search quota ran out. */
  quotaExhausted: boolean;
  playlistId: string | null;
  playlistUrl: string | null;
  /** A code from the edge function, not a sentence. Screens render the wording. */
  failure: string | null;
  service: MusicService | null;
}

interface ConvertPlaylistResult {
  playlistId?: string;
  playlistUrl?: string | null;
  matchedTracks?: number;
  totalTracks?: number;
  unmatchedTracks?: { title: string; artist: string }[];
  quotaExhausted?: boolean;
  error?: string;
}

interface ConversionsApi {
  /** Every conversion this session has started, by shared item id. */
  conversions: Record<string, Conversion>;
  /** Starts one, or does nothing if it is already running. */
  convert: (input: { itemId: string; title: string; total: number; service: MusicService }) => void;
  /** Clears a finished one, so its pill and its retry state go away. */
  dismiss: (itemId: string) => void;
}

const ConversionsContext = createContext<ConversionsApi>({
  conversions: {},
  convert: () => {},
  dismiss: () => {},
});

/**
 * Conversions live above the screens that start them.
 *
 * A playlist conversion takes minutes and runs server-side. When it was owned
 * by the modal, navigating away lost the progress and left the user with no
 * sign it was still going. Here it survives anything but quitting the app, and
 * a pill above the tab bar keeps it visible.
 */
export function ConversionsProvider({ children }: { children: React.ReactNode }) {
  const [conversions, setConversions] = useState<Record<string, Conversion>>({});
  const channels = useRef<Record<string, ReturnType<typeof supabase.channel>>>({});

  const update = useCallback((itemId: string, patch: Partial<Conversion>) => {
    setConversions((prev) => (prev[itemId] ? { ...prev, [itemId]: { ...prev[itemId], ...patch } } : prev));
  }, []);

  const teardown = useCallback((itemId: string) => {
    const channel = channels.current[itemId];
    if (channel) {
      supabase.removeChannel(channel);
      delete channels.current[itemId];
    }
  }, []);

  useEffect(() => {
    const open = channels.current;
    return () => {
      for (const channel of Object.values(open)) supabase.removeChannel(channel);
    };
  }, []);

  const convert = useCallback(({ itemId, title, total, service }: {
    itemId: string; title: string; total: number; service: MusicService;
  }) => {
    setConversions((prev) => {
      const running = prev[itemId];
      if (running && (running.state === 'waiting' || running.state === 'processing')) return prev;
      return {
        ...prev,
        [itemId]: {
          itemId, title, total, service,
          state: 'waiting', processed: 0, matched: null,
          unmatched: [], quotaExhausted: false,
          playlistId: null, playlistUrl: null, failure: null,
        },
      };
    });

    // Subscribe to the narrow progress row rather than the shared item, whose
    // tracks jsonb would be broadcast on every tick. INSERT as well as UPDATE:
    // the first write for an item is an upsert-insert.
    let finishedViaRealtime = false;
    const channel = supabase
      .channel(`conversion:${itemId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversion_progress', filter: `shared_item_id=eq.${itemId}` },
        (payload) => {
          const row = payload.new as { status: string; tracks_processed: number };
          update(itemId, { processed: row.tracks_processed ?? 0 });
          if (row.status === 'processing') update(itemId, { state: 'processing' });
          if (row.status === 'done') {
            finishedViaRealtime = true;
            update(itemId, { state: 'done' });
            teardown(itemId);
          }
          // 'failed' is deliberately not handled here: the HTTP response
          // carries the reason, and a state change without one is unhelpful.
        },
      )
      .subscribe();
    channels.current[itemId] = channel;

    void (async () => {
      const { data, error } = await supabase.functions.invoke<ConvertPlaylistResult>(
        'convert-playlist',
        { body: { sharedItemId: itemId } },
      );

      if (data?.playlistId) {
        update(itemId, {
          playlistId: data.playlistId,
          playlistUrl: data.playlistUrl ?? null,
          matched: typeof data.matchedTracks === 'number' ? data.matchedTracks : null,
          unmatched: data.unmatchedTracks ?? [],
          quotaExhausted: !!data.quotaExhausted,
        });
      }

      if (finishedViaRealtime) return;
      teardown(itemId);

      if (error) {
        let reason: string | null = null;
        try {
          const body = await error.context?.text?.();
          if (body) {
            try { reason = JSON.parse(body)?.error ?? null; }
            catch { reason = body.length < 300 ? body : null; }
          }
        } catch {
          // The body is a nicety; the failure state matters more than its text.
        }
        update(itemId, { state: 'failed', failure: reason });
        return;
      }

      if (data?.playlistId) update(itemId, { state: 'done' });
      else update(itemId, { state: 'failed', failure: data?.error ?? null });
    })();
  }, [teardown, update]);

  const dismiss = useCallback((itemId: string) => {
    teardown(itemId);
    setConversions((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }, [teardown]);

  const value = useMemo(() => ({ conversions, convert, dismiss }), [conversions, convert, dismiss]);

  return <ConversionsContext.Provider value={value}>{children}</ConversionsContext.Provider>;
}

export function useConversions(): ConversionsApi {
  return useContext(ConversionsContext);
}

/** The one still running, if any. What the pill shows. */
export function activeConversion(conversions: Record<string, Conversion>): Conversion | null {
  return Object.values(conversions).find((c) => c.state === 'waiting' || c.state === 'processing') ?? null;
}

/** Turns an edge-function failure code into something worth reading. */
export function conversionErrorMessage(failure: string | null, service: MusicService | null, serviceName: string): string {
  void service;
  if (!failure) return 'Conversion failed. Check your connection and try again.';
  if (failure === 'spotify_rate_limit_exceeded') return "Spotify's daily quota is used up. Try again in about 12 hours.";
  if (failure === 'apple_music_token_unavailable') return 'Apple Music auth is unavailable. Reconnect it in Settings.';
  if (failure === 'No tracks could be matched on the destination service') return `None of these tracks turned up on ${serviceName}.`;
  if (failure === 'spotify_token_refresh_failed') return 'Your Spotify session expired. Reconnect it in Settings.';
  if (failure === 'not_connected') return `You are not connected to ${serviceName}. Connect it in Settings.`;
  if (failure === 'spotify_permission_denied') return 'Missing a Spotify permission. Disconnect and reconnect Spotify.';
  if (failure.endsWith('_auth_failed')) return `Your ${serviceName} session expired. Reconnect it in Settings.`;
  if (failure.endsWith('_permission_denied')) return `Missing a ${serviceName} permission. Disconnect and reconnect it in Settings.`;
  if (failure.endsWith('_quota_exceeded')) return `${serviceName}'s daily search limit is used up. Try again tomorrow.`;
  if (failure === 'tracks_not_added') return `The playlist was created but no tracks went in. Try reconnecting ${serviceName}.`;
  if (failure === 'playlist_creation_failed') return `The playlist could not be created on ${serviceName}.`;
  return `Conversion failed: ${failure}`;
}
