/**
 * Races a promise against a timeout. Rejects with an Error('timeout') if the
 * promise does not settle within `ms` milliseconds. This prevents loading
 * states from hanging forever when network requests stall.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

export function cleanArtistName(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official$/i, '')
    .trim();
}
