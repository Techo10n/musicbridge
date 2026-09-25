/**
 * How much two people's music overlaps, and why.
 *
 * The People tab and the profile screen both show a match percentage, and each
 * used to compute it differently — with different baselines, so the same pair
 * of people scored differently depending on where you looked. This is the one
 * implementation, and it returns the artists behind the number so a screen can
 * show its working rather than asserting a figure.
 */
import { FavoriteSong, MusicService } from '../types';

export interface TasteRow {
  artist: string | null;
  title: string | null;
}

export interface TasteProfile {
  artists: Set<string>;
  titles: Set<string>;
}

export interface TasteMatch {
  /** Null when the two of you have too little known music to say anything. */
  score: number | null;
  /** Artists you both have, most useful first. What the score is made of. */
  sharedArtists: string[];
}

/**
 * Below this many known songs across both people, a percentage is an artefact
 * of the sample size rather than a measurement.
 */
export const MIN_TASTE_DATA = 4;

/** Casefold and strip punctuation so "Cigarettes After Sex" matches "cigarettes after sex". */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildTasteProfile(rows: TasteRow[], favorite?: FavoriteSong | null): TasteProfile {
  const artists = new Set<string>();
  const titles = new Set<string>();

  for (const row of rows) {
    const artist = normalizeName(row.artist);
    const title = normalizeName(row.title);
    if (artist) artists.add(artist);
    if (title) titles.add(title);
  }

  const favArtist = normalizeName(favorite?.artist);
  const favTitle = normalizeName(favorite?.title);
  if (favArtist) artists.add(favArtist);
  if (favTitle) titles.add(favTitle);

  return { artists, titles };
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const entry of a) if (b.has(entry)) overlap += 1;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? overlap / union : 0;
}

function intersection(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = [];
  for (const entry of a) if (b.has(entry)) shared.push(entry);
  return shared;
}

export interface TasteMatchOptions {
  /** A small nudge for listening on the same service, which makes sharing easier. */
  sameService?: boolean;
  /** Both people naming the same favourite is worth more than one shared play. */
  sameFavoriteArtist?: boolean;
}

/**
 * Artists dominate on purpose: two people who both listen to an artist have
 * more in common than two who happen to know one song with the same title.
 */
export function tasteMatch(
  mine: TasteProfile,
  theirs: TasteProfile,
  options: TasteMatchOptions = {},
): TasteMatch {
  const dataPoints = mine.artists.size + mine.titles.size + theirs.artists.size + theirs.titles.size;
  const sharedArtists = intersection(mine.artists, theirs.artists);

  if (dataPoints < MIN_TASTE_DATA) return { score: null, sharedArtists };

  const raw =
    jaccard(mine.artists, theirs.artists) * 62
    + jaccard(mine.titles, theirs.titles) * 24
    + (options.sameService ? 6 : 0)
    + (options.sameFavoriteArtist ? 8 : 0);

  return { score: Math.max(0, Math.min(100, Math.round(raw))), sharedArtists };
}

/** The one-line summary under a match percentage. */
export function tasteSummary(match: TasteMatch): string {
  if (match.score === null) return 'Not enough in common yet';
  const n = match.sharedArtists.length;
  if (n === 0) return 'No artists in common so far';
  return n === 1 ? '1 artist in common' : `${n} artists in common`;
}

export function sameServiceBonus(
  a: MusicService | null | undefined,
  b: MusicService | null | undefined,
): boolean {
  return !!a && a === b;
}
