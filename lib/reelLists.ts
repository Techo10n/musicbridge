import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase as supabaseClient } from './supabase';
import { ReelSong } from './reelParser';

export interface SavedReelList {
  id: string;
  title: string;
  reelUrl: string;
  songs: ReelSong[];
  createdAt: string;
}

const keyForUser = (userId: string) => `saved_reel_lists_${userId}`;
const writeLocks = new Map<string, Promise<void>>();
let remoteUnavailable = false;
const supabase = supabaseClient as any;

function makeTitle(createdAt: Date, songCount: number): string {
  const date = createdAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Reel list - ${date} - ${songCount} song${songCount === 1 ? '' : 's'}`;
}

async function getLocalReelLists(userId: string): Promise<SavedReelList[]> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as SavedReelList[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function setLocalReelLists(userId: string, lists: SavedReelList[]): Promise<void> {
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(lists));
}

async function saveRemoteReelList(
  userId: string,
  reelUrl: string,
  songs: ReelSong[],
  options?: { title?: string; createdAt?: string },
): Promise<SavedReelList> {
  const now = options?.createdAt ? new Date(options.createdAt) : new Date();
  const title = options?.title ?? makeTitle(now, songs.length);

  const { data: savedImport, error: importError } = await supabase
    .from('reel_imports')
    .upsert(
      {
        user_id: userId,
        reel_url: reelUrl,
        title,
        created_at: now.toISOString(),
      },
      { onConflict: 'user_id,reel_url' },
    )
    .select('id,title,reel_url,created_at')
    .single();

  if (importError) throw importError;

  const { error: deleteError } = await supabase
    .from('reel_import_songs')
    .delete()
    .eq('reel_import_id', savedImport.id);
  if (deleteError) throw deleteError;

  if (songs.length > 0) {
    const { error: songsError } = await supabase
      .from('reel_import_songs')
      .insert(songs.map((song, index) => ({
        reel_import_id: savedImport.id,
        position: index,
        title: song.title,
        artist: song.artist,
        cover_url: song.coverUrl,
      })));
    if (songsError) throw songsError;
  }

  return {
    id: savedImport.id,
    title: savedImport.title,
    reelUrl: savedImport.reel_url,
    songs,
    createdAt: savedImport.created_at,
  };
}

async function migrateLocalReelLists(userId: string, localLists: SavedReelList[]): Promise<SavedReelList[]> {
  const migrated: SavedReelList[] = [];
  for (const list of localLists) {
    migrated.push(await saveRemoteReelList(userId, list.reelUrl, list.songs, {
      title: list.title,
      createdAt: list.createdAt,
    }));
  }
  return migrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSavedReelLists(userId: string): Promise<SavedReelList[]> {
  if (!remoteUnavailable) {
    try {
      const { data, error } = await supabase
        .from('reel_imports')
        .select(`
          id,
          title,
          reel_url,
          created_at,
          reel_import_songs (
            position,
            title,
            artist,
            cover_url
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('position', { foreignTable: 'reel_import_songs', ascending: true });

      if (error) throw error;

      const remoteLists = (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        reelUrl: row.reel_url,
        createdAt: row.created_at,
        songs: (row.reel_import_songs ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((song: any) => ({
            title: song.title,
            artist: song.artist,
            coverUrl: song.cover_url,
          })),
      }));

      if (remoteLists.length > 0) return remoteLists;

      const localLists = await getLocalReelLists(userId);
      if (localLists.length === 0) return [];
      return await migrateLocalReelLists(userId, localLists);
    } catch (err) {
      remoteUnavailable = true;
      console.warn('[reelLists] Supabase reel history unavailable; falling back to local storage:', err);
    }
  }

  return getLocalReelLists(userId);
}

async function withReelListWriteLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const storageKey = keyForUser(userId);
  const previous = writeLocks.get(storageKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => {}).then(() => gate);
  writeLocks.set(storageKey, next);

  await previous.catch(() => {});

  try {
    return await fn();
  } finally {
    release();
    if (writeLocks.get(storageKey) === next) {
      writeLocks.delete(storageKey);
    }
  }
}

export async function saveReelList(
  userId: string,
  reelUrl: string,
  songs: ReelSong[],
): Promise<SavedReelList> {
  return withReelListWriteLock(userId, async () => {
    const now = new Date();
    const title = makeTitle(now, songs.length);

    if (!remoteUnavailable) {
      try {
        return await saveRemoteReelList(userId, reelUrl, songs, { title, createdAt: now.toISOString() });
      } catch (err) {
        remoteUnavailable = true;
        console.warn('[reelLists] Supabase reel save unavailable; falling back to local storage:', err);
      }
    }

    const existing = await getSavedReelLists(userId);
    const saved: SavedReelList = { id: `${now.getTime()}`, title, reelUrl, songs, createdAt: now.toISOString() };

    const withoutSameReel = existing.filter((list) => list.reelUrl !== reelUrl);
    const next = [saved, ...withoutSameReel];
    await setLocalReelLists(userId, next);
    return saved;
  });
}

export async function deleteReelList(userId: string, listId: string): Promise<void> {
  await withReelListWriteLock(userId, async () => {
    if (!remoteUnavailable) {
      try {
        const { error } = await supabase
          .from('reel_imports')
          .delete()
          .eq('user_id', userId)
          .eq('id', listId);
        if (error) throw error;
        return;
      } catch (err) {
        remoteUnavailable = true;
        console.warn('[reelLists] Supabase reel delete unavailable; falling back to local storage:', err);
      }
    }

    const existing = await getSavedReelLists(userId);
    const next = existing.filter((list) => list.id !== listId);
    await setLocalReelLists(userId, next);
  });
}
