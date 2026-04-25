import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Follow, User } from '../types';
import { useAuth } from './useAuth';
import { sendPushNotification } from '../lib/notifications';

export function useFollows() {
  const { session } = useAuth();
  const userId = session?.user.id;

  const [following, setFollowing] = useState<User[]>([]);
  const [followers, setFollowers] = useState<User[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchFollows = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [followingRes, followersRes] = await Promise.all([
        // People the current user follows
        supabase
          .from('follows')
          .select('following:following_id(id, username, display_name, avatar_url, primary_service)')
          .eq('follower_id', userId),
        // People who follow the current user
        supabase
          .from('follows')
          .select('follower:follower_id(id, username, display_name, avatar_url, primary_service)')
          .eq('following_id', userId),
      ]);

      const followingData = (followingRes.data ?? []) as unknown as Array<{ following: User }>;
      const followersData = (followersRes.data ?? []) as unknown as Array<{ follower: User }>;

      const followingUsers = followingData.map((r) => r.following).filter(Boolean);
      const followerUsers = followersData.map((r) => r.follower).filter(Boolean);

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
    fetchFollows();
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
      const follower = (await supabase
        .from('users')
        .select('display_name, username')
        .eq('id', userId)
        .single()).data;
      const name = follower?.display_name ?? follower?.username ?? 'Someone';
      sendPushNotification(
        targetId,
        'New follower',
        `${name} started following you`,
        { type: 'new_follower' },
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
        .from('users')
        .select('id, username, display_name, avatar_url, primary_service')
        .ilike('username', `%${query.trim()}%`)
        .neq('id', userId ?? '')
        .limit(20);
      if (error) return [];
      return (data as User[]) ?? [];
    },
    [userId],
  );

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
    refresh: fetchFollows,
  };
}
