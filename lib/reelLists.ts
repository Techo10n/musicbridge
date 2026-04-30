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
let lastRemoteFailureTimestamp = 0;
let remoteBackoffAttempts = 0;
const REMOTE_BACKOFF_BASE_MS = 30_000;
const REMOTE_BACKOFF_MAX_MS = 5 * 60_000;
const supabase = supabaseClient as any;

function shouldTryRemote(): boolean {
  if (!remoteUnavailable) return true;
  const elapsed = Date.now() - lastRemoteFailureTimestamp;
  const cooldown = Math.min(
    REMOTE_BACKOFF_MAX_MS,
    REMOTE_BACKOFF_BASE_MS * Math.max(1, 2 ** Math.max(0, remoteBackoffAttempts - 1)),
  );
  return elapsed >= cooldown;
}

function markRemoteUnavailable(error: unknown): void {
  remoteUnavailable = true;
  lastRemoteFailureTimestamp = Date.now();
  remoteBackoffAttempts += 1;
  console.warn('[reelLists] Supabase reel history unavailable; falling back to local storage:', error);
}

function markRemoteAvailable(): void {
  remoteUnavailable = false;
  lastRemoteFailureTimestamp = 0;
  remoteBackoffAttempts = 0;
}

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

  const songsWithPositions = songs.map((song, index) => ({
    position: index,
    title: song.title,
    artist: song.artist,
    cover_url: song.coverUrl,
  }));

  const { error: songsError } = await supabase.rpc('upsert_reel_import_songs', {
    p_reel_import_id: savedImport.id,
    p_songs: songsWithPositions,
  });
  if (songsError) throw songsError;

  markRemoteAvailable();

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
  const remaining: SavedReelList[] = [];

  for (const list of localLists) {
    try {
      migrated.push(await saveRemoteReelList(userId, list.reelUrl, list.songs, {
        title: list.title,
        createdAt: list.createdAt,
      }));
    } catch (err) {
      console.warn('[reelLists] local reel migration failed:', list.reelUrl, err);
      remaining.push(list);
    }
  }

  if (migrated.length > 0) {
    if (remaining.length > 0) await setLocalReelLists(userId, remaining);
    else await AsyncStorage.removeItem(keyForUser(userId));
  }

  return migrated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getSavedReelLists(userId: string): Promise<SavedReelList[]> {
  if (shouldTryRemote()) {
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
      markRemoteAvailable();

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
      markRemoteUnavailable(err);
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

    if (shouldTryRemote()) {
      try {
        return await saveRemoteReelList(userId, reelUrl, songs, { title, createdAt: now.toISOString() });
      } catch (err) {
        markRemoteUnavailable(err);
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
    if (shouldTryRemote()) {
      try {
        const { error } = await supabase
          .from('reel_imports')
          .delete()
          .eq('user_id', userId)
          .eq('id', listId);
        if (error) throw error;
        markRemoteAvailable();
        return;
      } catch (err) {
        markRemoteUnavailable(err);
      }
    }

    const existing = await getSavedReelLists(userId);
    const next = existing.filter((list) => list.id !== listId);
    await setLocalReelLists(userId, next);
  });
}
