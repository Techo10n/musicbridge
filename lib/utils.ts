/**
 * Races a promise against a timeout. Rejects with an Error('timeout') if the
 * promise does not settle within `ms` milliseconds. This prevents loading
 * states from hanging forever when network requests stall.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), ms);
  });

  return Promise.race([promise.finally(() => clearTimeout(timeoutId)), timeout]);
}

export function cleanArtistName(artist: string): string {
  if (!artist) return '';
  return artist
    .replace(/ - Topic$/i, '')
    .replace(/VEVO$/i, '')
    .replace(/Official$/i, '')
    .trim();
}

/**
 * Strips common parenthetical suffixes from track titles before cross-service
 * searching. Removes remaster, deluxe, feat., radio edit, and similar tags
 * that platforms add inconsistently, which would otherwise cause mismatches.
 *
 * Examples:
 *   "Hotel California (2013 Remaster)"  → "Hotel California"
 *   "Blinding Lights (feat. The Weeknd)" → "Blinding Lights"
 *   "Bohemian Rhapsody [Radio Edit]"    → "Bohemian Rhapsody"
 */
export function cleanTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(
      /[\(\[](remaster(ed)?|\d{4} remaster|remastered \d{4}|deluxe|anniversary|expanded|bonus track|radio edit|single version|album version|feat\.[^\)\]]*|ft\.[^\)\]]*)[\)\]]/gi,
      '',
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}
