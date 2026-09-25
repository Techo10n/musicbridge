import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  historyOptInKey, loadListeningHistoryPref, readListeningHistoryPref,
  setListeningHistoryPref, subscribeToListeningHistory,
} from '../lib/listeningHistory';

beforeEach(async () => {
  await AsyncStorage.clear();
  await setListeningHistoryPref('u1', false);
});

describe('listening history preference', () => {
  it('defaults to off, so nobody starts broadcasting what they play', async () => {
    await AsyncStorage.clear();
    await loadListeningHistoryPref('fresh-user');
    expect(readListeningHistoryPref()).toBe(false);
  });

  it('persists under a per-user key, so two accounts on one phone do not share it', async () => {
    await setListeningHistoryPref('u1', true);
    expect(await AsyncStorage.getItem(historyOptInKey('u1'))).toBe('true');
    expect(await AsyncStorage.getItem(historyOptInKey('u2'))).toBeNull();
  });

  it('reads back what was stored', async () => {
    await setListeningHistoryPref('u1', true);
    await loadListeningHistoryPref('u1');
    expect(readListeningHistoryPref()).toBe(true);
  });

  it('tells every screen at once, so Settings and Profile never disagree', async () => {
    const seen: boolean[] = [];
    const unsubscribe = subscribeToListeningHistory(() => seen.push(readListeningHistoryPref()));
    await setListeningHistoryPref('u1', true);
    await setListeningHistoryPref('u1', false);
    unsubscribe();
    await setListeningHistoryPref('u1', true);
    expect(seen).toEqual([true, false]);
  });

  it('does not wake subscribers when the value is unchanged', async () => {
    const unsubscribe = subscribeToListeningHistory(jest.fn());
    await setListeningHistoryPref('u1', true);
    const listener = jest.fn();
    const stop = subscribeToListeningHistory(listener);
    await setListeningHistoryPref('u1', true);
    stop(); unsubscribe();
    expect(listener).not.toHaveBeenCalled();
  });

  it('survives storage being unavailable rather than crashing the screen', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('no disk'));
    await expect(setListeningHistoryPref('u1', true)).resolves.toBeUndefined();
    // The switch still moved, even though the write did not land.
    expect(readListeningHistoryPref()).toBe(true);
    spy.mockRestore();
  });
});
