import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SharedItem } from '../types';
import { useAuth } from './useAuth';

export function useSharedItems() {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const { session } = useAuth();

  const fetchItems = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const { data, error } = await supabase
        .from('shared_items')
        .select('*')
        .eq('recipient_id', session.user.id)
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
  }, [session?.user.id]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Real-time: re-fetch whenever a new shared_item lands in our inbox
  useEffect(() => {
    if (!session?.user.id) return;

    const channel = supabase
      .channel(`shared_items:${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'shared_items',
          filter: `recipient_id=eq.${session.user.id}`,
        },
        () => { fetchItems(); },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'shared_items',
          filter: `recipient_id=eq.${session.user.id}`,
        },
        () => { fetchItems(); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user.id, fetchItems]);

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
