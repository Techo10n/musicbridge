import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';
import { useAuth } from './useAuth';
import { sendPushNotification } from '../lib/notifications';

export function useFollows() {
  const { session, user } = useAuth();
  const userId = session?.user.id;

  const [following, setFollowing] = useState<User[]>([]);
  const [followers, setFollowers] = useState<User[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchFollows = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // `follows` only stores ids; the public profile fields for the other
      // side of each edge live in `user_public_profiles`, not the owner-only
      // `users` table, so this is a lookup followed by a batched fetch rather
      // than a single PostgREST embed.
      const [followingRes, followersRes] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', userId),
        supabase.from('follows').select('follower_id').eq('following_id', userId),
      ]);

      const followingIdList = (followingRes.data ?? []).map((r) => r.following_id as string);
      const followerIdList = (followersRes.data ?? []).map((r) => r.follower_id as string);
      const allIds = Array.from(new Set([...followingIdList, ...followerIdList]));

      const profileById = new Map<string, User>();
      if (allIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_public_profiles')
          .select('id, username, display_name, avatar_url, primary_service, favorite_song')
          .in('id', allIds);
        for (const p of (profiles ?? []) as User[]) profileById.set(p.id, p);
      }

      const followingUsers = followingIdList.map((id) => profileById.get(id)).filter((u): u is User => !!u);
      const followerUsers = followerIdList.map((id) => profileById.get(id)).filter((u): u is User => !!u);

      setFollowing(followingUsers);
      setFollowers(followerUsers);
      setFollowingIds(new Set(followingUsers.map((u) => u.id)));
    } catch (err) {
      console.error('[useFollows] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchFollows();
    })();
    return () => { cancelled = true; };
  }, [fetchFollows]);

  const followUser = useCallback(
    async (targetId: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from('follows')
        .insert({ follower_id: userId, following_id: targetId });
      if (error) throw error;
      await fetchFollows();
      // Notify the person being followed — fire-and-forget
      sendPushNotification(
        targetId,
        'new_follower',
      ).catch((err) => console.warn('[useFollows] follow notification failed:', err));
    },
    [userId, fetchFollows],
  );

  const unfollowUser = useCallback(
    async (targetId: string) => {
      if (!userId) return;
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', userId)
        .eq('following_id', targetId);
      if (error) throw error;
      await fetchFollows();
    },
    [userId, fetchFollows],
  );

  const isFollowing = useCallback(
    (targetId: string) => followingIds.has(targetId),
    [followingIds],
  );

  /** Get follower + following counts for any user (for profile display) */
  const getFollowCounts = useCallback(async (targetUserId: string) => {
    const [followersRes, followingRes] = await Promise.all([
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', targetUserId),
      supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('follower_id', targetUserId),
    ]);
    return {
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
    };
  }, []);

  /** Search users by username, returns results annotated with isFollowing */
  const searchUsers = useCallback(
    async (query: string): Promise<User[]> => {
      if (!query.trim()) return [];
      const { data, error } = await supabase
        .from('user_public_profiles')
        .select('id, username, display_name, avatar_url, primary_service, favorite_song')
        .ilike('username', `%${query.trim()}%`)
        .neq('id', userId ?? '')
        .limit(20);
      if (error) return [];
      return (data as User[]) ?? [];
    },
    [userId],
  );

  const getSuggestedUsers = useCallback(async (limit = 12): Promise<User[]> => {
    if (!userId) return [];

    const { data, error } = await supabase
      .from('user_public_profiles')
      .select('id, username, display_name, avatar_url, primary_service, favorite_song')
      .neq('id', userId)
      .limit(60);

    if (error || !data) return [];

    return (data as User[])
      .filter((candidate) => !followingIds.has(candidate.id))
      .sort((a, b) => {
        const aSameService = a.primary_service && a.primary_service === user?.primary_service ? 1 : 0;
        const bSameService = b.primary_service && b.primary_service === user?.primary_service ? 1 : 0;
        if (aSameService !== bSameService) return bSameService - aSameService;
        const aHasFavorite = a.favorite_song ? 1 : 0;
        const bHasFavorite = b.favorite_song ? 1 : 0;
        if (aHasFavorite !== bHasFavorite) return bHasFavorite - aHasFavorite;
        return a.username.localeCompare(b.username);
      })
      .slice(0, limit);
  }, [followingIds, user?.primary_service, userId]);

  /** Users who both follow you AND you follow back — the only people you can share with */
  const mutualFollows = following.filter((u) =>
    followers.some((f) => f.id === u.id),
  );

  return {
    following,
    followers,
    mutualFollows,
    followingIds,
    loading,
    followUser,
    unfollowUser,
    isFollowing,
    getFollowCounts,
    searchUsers,
    getSuggestedUsers,
    refresh: fetchFollows,
  };
}
