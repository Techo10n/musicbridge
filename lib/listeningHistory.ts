import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether this user lets Museaic read what they have been playing.
 *
 * It lives outside React because two screens show the same switch — Settings
 * under Privacy, and Profile above the recent-tracks strip. When each screen
 * kept its own copy, flipping one left the other showing the opposite of the
 * truth until it remounted. A single store with subscribers makes that
 * impossible.
 *
 * Off is the default: reading someone's play history is something they opt
 * into, never something they discover after the fact.
 */
export const historyOptInKey = (userId: string) => `profile_history_opt_in_${userId}`;

let optedIn = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** The current value. Synchronous, so it is safe to read during render. */
export function readListeningHistoryPref(): boolean {
  return optedIn;
}

export function subscribeToListeningHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Pulls the stored value for a user into the store. Call once per sign-in. */
export async function loadListeningHistoryPref(userId: string): Promise<void> {
  let next = false;
  try {
    next = (await AsyncStorage.getItem(historyOptInKey(userId))) === 'true';
  } catch (err) {
    console.warn('[listeningHistory] load failed:', err);
  }
  if (next === optedIn) return;
  optedIn = next;
  emit();
}

/**
 * Flips the switch. The in-memory value moves first so the UI responds
 * immediately; a failed write costs the user their setting next launch, which
 * is better than a switch that appears stuck.
 */
export async function setListeningHistoryPref(userId: string, enabled: boolean): Promise<void> {
  if (enabled !== optedIn) {
    optedIn = enabled;
    emit();
  }
  try {
    await AsyncStorage.setItem(historyOptInKey(userId), enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[listeningHistory] save failed:', err);
  }
}

/** Subscribes a component to the store. */
export function useListeningHistoryPref(): boolean {
  return useSyncExternalStore(subscribeToListeningHistory, readListeningHistoryPref, readListeningHistoryPref);
}
