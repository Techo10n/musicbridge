import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Reaction {
  id: string;
  item_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

// emoji → count map per item
type ReactionMap = Record<string, Record<string, number>>;

export function useReactions(itemIds: string[]) {
  const { user } = useAuth();
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const latestMyReactions = useRef<Record<string, string>>({});

  useEffect(() => {
    latestMyReactions.current = myReactions;
  }, [myReactions]);

  const fetch = useCallback(async () => {
    if (!itemIds.length || !user) return;
    try {
      const { data } = await supabase
        .from('shared_item_reactions')
        .select('*')
        .in('item_id', itemIds);

      if (!data) return;

      const map: ReactionMap = {};
      const mine: Record<string, string> = {};

      for (const r of data as Reaction[]) {
        if (!map[r.item_id]) map[r.item_id] = {};
        map[r.item_id][r.emoji] = (map[r.item_id][r.emoji] ?? 0) + 1;
        if (r.user_id === user.id) mine[r.item_id] = r.emoji;
      }

      setReactions(map);
      latestMyReactions.current = mine;
      setMyReactions(mine);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[useReactions] query failed:', err);
      }
    }
  }, [itemIds.join(','), user]);

  useEffect(() => { fetch(); }, [fetch]);

  const react = useCallback(async (itemId: string, emoji: string) => {
    if (!user) return;
    const previousMyReactions = latestMyReactions.current;
    const previousReactions = reactions;
    const old = previousMyReactions[itemId];

    // Optimistic update
    const nextMyReactions = { ...previousMyReactions, [itemId]: emoji };
    latestMyReactions.current = nextMyReactions;
    setMyReactions(nextMyReactions);
    setReactions(prev => {
      const cur = { ...(prev[itemId] ?? {}) };
      if (old && old !== emoji) {
        cur[old] = Math.max(0, (cur[old] ?? 1) - 1);
        if (cur[old] === 0) delete cur[old];
      }
      cur[emoji] = (cur[emoji] ?? 0) + 1;
      return { ...prev, [itemId]: cur };
    });

    try {
      await supabase.from('shared_item_reactions').upsert({
        item_id: itemId,
        user_id: user.id,
        emoji,
      }, { onConflict: 'item_id,user_id' });
    } catch (err) {
      console.error('[useReactions] upsert failed:', err);
      latestMyReactions.current = previousMyReactions;
      setMyReactions(previousMyReactions);
      setReactions(previousReactions);
    }
  }, [user, reactions]);

  return { reactions, myReactions, react };
}
