import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReelSong } from './reelParser';

export interface SavedReelList {
  id: string;
  title: string;
  reelUrl: string;
  songs: ReelSong[];
  createdAt: string;
}

const keyForUser = (userId: string) => `saved_reel_lists_${userId}`;

function makeTitle(createdAt: Date, songCount: number): string {
  const date = createdAt.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `Reel list - ${date} - ${songCount} song${songCount === 1 ? '' : 's'}`;
}

export async function getSavedReelLists(userId: string): Promise<SavedReelList[]> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as SavedReelList[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveReelList(
  userId: string,
  reelUrl: string,
  songs: ReelSong[],
): Promise<SavedReelList> {
  const existing = await getSavedReelLists(userId);
  const now = new Date();
  const saved: SavedReelList = {
    id: `${now.getTime()}`,
    title: makeTitle(now, songs.length),
    reelUrl,
    songs,
    createdAt: now.toISOString(),
  };

  const withoutSameReel = existing.filter((list) => list.reelUrl !== reelUrl);
  const next = [saved, ...withoutSameReel];
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(next));
  return saved;
}

export async function deleteReelList(userId: string, listId: string): Promise<void> {
  const existing = await getSavedReelLists(userId);
  const next = existing.filter((list) => list.id !== listId);
  await AsyncStorage.setItem(keyForUser(userId), JSON.stringify(next));
}
