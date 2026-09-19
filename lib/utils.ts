/**
 * Races a promise against a timeout. Rejects with an Error('timeout') if the
 * promise does not settle within `ms` milliseconds. This prevents loading
 * states from hanging forever when network requests stall.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      clearTimer();
      reject(new Error('timeout'));
    }, ms);
  });

  return Promise.race([promise.finally(clearTimer), timeout]);
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
      /[\(\[]([^)\]]*(remaster(ed)?|\d{4} remaster|remastered \d{4}|deluxe|anniversary|expanded|bonus track|radio edit|single version|album version|official audio|official music video|official video|visualizer|lyrics?|audio|feat\.|ft\.)[^)\]]*)[\)\]]/gi,
      '',
    )
    .replace(/\s+-\s+(official audio|official music video|official video|visualizer|lyrics?|audio)$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Compact relative time for feed rows and activity: "now", "4m", "3h", "2d",
 * then a short date once it is a week old. Future or invalid dates read as
 * "now" rather than a negative number.
 */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t) || t > now) return 'now';
  const s = Math.floor((now - t) / 1000);
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Short "where we are in the year" label for the profile stats card, e.g.
 * `SEP · WK 38`. Week is the ISO-8601 week number, so it matches what other
 * year-in-review products show.
 */
export function monthWeekLabel(date: Date = new Date()): string {
  const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();

  // ISO week: Thursday of the current week decides which year/week it belongs to.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);

  return `${month} · WK ${week}`;
}
