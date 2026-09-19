import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SharedItem } from '../types';
import { useAuth } from './useAuth';

export function useSharedItems() {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { session } = useAuth();
  const userId = session?.user.id;

  const fetchItems = useCallback(async () => {
    if (!userId) return;

    try {
      // Explicitly exclude `tracks`: the list only needs a count, and selecting
      // the jsonb pulled every track blob in the inbox on every refetch.
      // PlaylistModal loads the full array for the one item it opens.
      // Keep the select string a single literal — supabase-js derives the row
      // type from it, and concatenation collapses that to GenericStringError.
      const { data, error } = await supabase
        .from('shared_items')
        .select('id, sender_id, recipient_id, type, title, artist, cover_image_url, spotify_id, apple_music_id, youtube_music_id, spotify_playlist_id, apple_music_playlist_id, apple_music_playlist_url, youtube_music_playlist_id, tracks_count, message, opened, conversion_status, created_at')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = data ?? [];

      // Sender display fields live in the public-profile view, not the
      // owner-only `users` table, so fetch them separately and merge.
      const senderIds = Array.from(new Set(rows.map((r) => r.sender_id as string)));
      const senderById = new Map<string, unknown>();
      if (senderIds.length > 0) {
        const { data: senders } = await supabase
          .from('user_public_profiles')
          .select('id, username, display_name, avatar_url, primary_service')
          .in('id', senderIds);
        for (const s of senders ?? []) senderById.set(s.id as string, s);
      }

      const withSenders = rows.map((r) => ({ ...r, sender: senderById.get(r.sender_id as string) ?? null }));
      setItems(withSenders as SharedItem[]);
    } catch (err) {
      console.error('[useSharedItems] fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  // The guard is not ceremony: without it a resolved fetch can land after the
  // screen unmounts, and setting state then is both a warning and a leak.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchItems();
    })();
    return () => { cancelled = true; };
  }, [fetchItems]);

  // Real-time: re-fetch whenever a new shared_item lands in our inbox
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`shared_items:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shared_items',
          filter: `recipient_id=eq.${userId}`,
        },
        () => { fetchItems(); },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shared_items',
          filter: `recipient_id=eq.${userId}`,
        },
        () => { fetchItems(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchItems]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchItems();
  }, [fetchItems]);

  /** Mark an item as opened (updates local state optimistically) */
  const markAsOpened = useCallback(async (itemId: string) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, opened: true } : item)),
    );
    try {
      await supabase
        .from('shared_items')
        .update({ opened: true })
        .eq('id', itemId);
    } catch (err) {
      console.error('[useSharedItems] markAsOpened error:', err);
    }
  }, []);

  const unreadCount = items.filter((i) => !i.opened).length;

  return { items, loading, refreshing, refresh, markAsOpened, unreadCount };
}
