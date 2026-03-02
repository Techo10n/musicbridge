import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Friendship, User } from '../types';
import { useAuth } from './useAuth';

export function useFriends() {
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingRequests, setPendingRequests] = useState<Friendship[]>([]);
  const [loading, setLoading] = useState(true);

  const { session } = useAuth();

  const fetchFriends = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const { data, error } = await supabase
        .from('friendships')
        .select(
          `*, requester:requester_id(id, username, display_name, avatar_url),
              addressee:addressee_id(id, username, display_name, avatar_url)`,
        )
        .or(`requester_id.eq.${session.user.id},addressee_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const all = (data as Friendship[]) ?? [];

      setFriends(all.filter((f) => f.status === 'accepted'));
      // Only show incoming pending requests to the current user
      setPendingRequests(
        all.filter(
          (f) => f.status === 'pending' && f.addressee_id === session.user.id,
        ),
      );
    } catch (err) {
      console.error('[useFriends] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const sendFriendRequest = useCallback(
    async (addresseeId: string) => {
      if (!session?.user.id) return;
      const { error } = await supabase.from('friendships').insert({
        requester_id: session.user.id,
        addressee_id: addresseeId,
      });
      if (error) throw error;
      await fetchFriends();
    },
    [session?.user.id, fetchFriends],
  );

  const respondToRequest = useCallback(
    async (friendshipId: string, status: 'accepted' | 'declined') => {
      const { error } = await supabase
        .from('friendships')
        .update({ status })
        .eq('id', friendshipId);
      if (error) throw error;
      await fetchFriends();
    },
    [fetchFriends],
  );

  /** Search users by username (excludes the current user) */
  const searchUsers = useCallback(
    async (query: string): Promise<User[]> => {
      if (!query.trim()) return [];
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, primary_service')
        .ilike('username', `%${query.trim()}%`)
        .neq('id', session?.user.id ?? '')
        .limit(20);
      if (error) return [];
      return (data as User[]) ?? [];
    },
    [session?.user.id],
  );

  return {
    friends,
    pendingRequests,
    loading,
    sendFriendRequest,
    respondToRequest,
    searchUsers,
    refresh: fetchFriends,
  };
}
