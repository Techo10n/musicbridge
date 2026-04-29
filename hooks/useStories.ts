import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface Story {
  id: string;
  user_id: string;
  song_title: string;
  song_artist: string;
  song_cover_url: string | null;
  service: string;
  caption: string | null;
  expires_at: string;
  created_at: string;
  user?: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
  };
  reactions?: StoryReaction[];
  segment_index?: number;
  segment_total?: number;
}

export interface StoryReaction {
  id: string;
  story_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export function useStories() {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStories = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          *,
          user:users!stories_user_id_fkey(id, display_name, username, avatar_url)
        `)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        // Table may not exist yet — fail silently
        console.log('[useStories] fetch skipped:', error.message);
        return;
      }
      setStories((data as Story[]) ?? []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  const postStory = useCallback(async (params: {
    song_title: string;
    song_artist: string;
    song_cover_url?: string | null;
    service: string;
    caption?: string;
  }) => {
    if (!user) return null;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase.from('stories').insert({
      user_id: user.id,
      ...params,
      expires_at: expiresAt,
    }).select().single();
    if (error) throw error;
    await fetchStories();
    return data as Story;
  }, [user, fetchStories]);

  const reactToStory = useCallback(async (storyId: string, emoji: string) => {
    if (!user) return;
    await supabase.from('story_reactions').upsert({
      story_id: storyId,
      user_id: user.id,
      emoji,
    }, { onConflict: 'story_id,user_id' });
  }, [user]);

  // Group stories by user so each user appears once in the tray
  const storyGroups = stories.reduce<Map<string, Story[]>>((acc, story) => {
    const uid = story.user_id;
    if (!acc.has(uid)) acc.set(uid, []);
    acc.get(uid)!.push(story);
    return acc;
  }, new Map());

  return { stories, storyGroups, loading, fetchStories, postStory, reactToStory };
}
