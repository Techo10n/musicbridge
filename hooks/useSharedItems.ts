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
        .select(
          `*, sender:sender_id(id, username, display_name, avatar_url, primary_service)`,
        )
        .eq('recipient_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems((data as SharedItem[]) ?? []);
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
