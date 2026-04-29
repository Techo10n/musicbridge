import { useCallback, useEffect, useState } from 'react';
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
      setMyReactions(mine);
    } catch {
      // table may not exist — ignore
    }
  }, [itemIds.join(','), user]);

  useEffect(() => { fetch(); }, [fetch]);

  const react = useCallback(async (itemId: string, emoji: string) => {
    if (!user) return;

    // Optimistic update
    setMyReactions(prev => ({ ...prev, [itemId]: emoji }));
    setReactions(prev => {
      const cur = { ...(prev[itemId] ?? {}) };
      const old = myReactions[itemId];
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
    } catch {
      // silently fail if table missing
    }
  }, [user, myReactions]);

  return { reactions, myReactions, react };
}
