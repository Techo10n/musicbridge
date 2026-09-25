import {
  MIN_TASTE_DATA, buildTasteProfile, normalizeName, sameServiceBonus, tasteMatch, tasteSummary,
} from '../lib/taste';

const rows = (...pairs: [string, string][]) => pairs.map(([artist, title]) => ({ artist, title }));

describe('normalizeName', () => {
  it('casefolds and strips punctuation so the same artist matches itself', () => {
    expect(normalizeName('Cigarettes After Sex')).toBe('cigarettes after sex');
    expect(normalizeName('BEYONCÉ')).toBe(normalizeName('beyoncé'));
    expect(normalizeName('Tyler, The Creator')).toBe('tyler the creator');
    expect(normalizeName('  spaced   out ')).toBe('spaced out');
  });

  it('survives null and empty input', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
});

describe('buildTasteProfile', () => {
  it('collects artists and titles, and folds in the favourite song', () => {
    const profile = buildTasteProfile(rows(['MUNA', 'Silk Chiffon']), {
      title: 'About You', artist: 'The 1975', service: 'spotify', service_id: 'x', cover_url: '',
    });
    expect(profile.artists).toEqual(new Set(['muna', 'the 1975']));
    expect(profile.titles).toEqual(new Set(['silk chiffon', 'about you']));
  });

  it('deduplicates, so playing one artist a lot does not inflate the overlap', () => {
    const profile = buildTasteProfile(rows(['MUNA', 'a'], ['muna', 'b'], ['MUNA', 'c']));
    expect(profile.artists.size).toBe(1);
  });
});

describe('tasteMatch', () => {
  // Distinct artists *and* titles, so "unrelated" really is unrelated.
  const big = (prefix: string) =>
    buildTasteProfile(rows(...Array.from({ length: 6 },
      (_, i) => [`${prefix}-artist-${i}`, `${prefix}-title-${i}`] as [string, string])));

  it('says nothing when there is too little to go on', () => {
    const thin = buildTasteProfile(rows(['MUNA', 'Silk Chiffon']));
    const match = tasteMatch(thin, buildTasteProfile([]));
    expect(match.score).toBeNull();
    expect(tasteSummary(match)).toBe('Not enough in common yet');
  });

  it('scores identical taste far above unrelated taste', () => {
    const mine = big('artist');
    const same = tasteMatch(mine, big('artist')).score!;
    const different = tasteMatch(mine, big('other')).score!;
    expect(same).toBeGreaterThan(different);
    expect(different).toBeLessThan(20);
    expect(same).toBeGreaterThan(70);
  });

  it('never invents a floor: no overlap scores near zero', () => {
    const match = tasteMatch(big('a'), big('b'));
    expect(match.score).toBe(0);
    expect(match.sharedArtists).toEqual([]);
  });

  it('reports the artists the score is built from', () => {
    const mine = buildTasteProfile(rows(['MUNA', 'a'], ['Phoebe Bridgers', 'b'], ['Drake', 'c']));
    const theirs = buildTasteProfile(rows(['muna', 'd'], ['phoebe bridgers', 'e'], ['Adele', 'f']));
    const match = tasteMatch(mine, theirs);
    expect(match.sharedArtists.sort()).toEqual(['muna', 'phoebe bridgers']);
    expect(tasteSummary(match)).toBe('2 artists in common');
  });

  it('counts one shared artist in the singular', () => {
    const mine = buildTasteProfile(rows(['MUNA', 'a'], ['Drake', 'b']));
    const theirs = buildTasteProfile(rows(['muna', 'c'], ['Adele', 'd']));
    expect(tasteSummary(tasteMatch(mine, theirs))).toBe('1 artist in common');
  });

  it('weights a shared artist above a shared title', () => {
    const base = buildTasteProfile(rows(['A', 'x'], ['B', 'y'], ['C', 'z']));
    const sharedArtist = tasteMatch(base, buildTasteProfile(rows(['A', 'p'], ['D', 'q'], ['E', 'r']))).score!;
    const sharedTitle = tasteMatch(base, buildTasteProfile(rows(['P', 'x'], ['D', 'q'], ['E', 'r']))).score!;
    expect(sharedArtist).toBeGreaterThan(sharedTitle);
  });

  it('applies the bonuses without letting them carry the score', () => {
    const mine = big('a');
    const theirs = big('b');
    const plain = tasteMatch(mine, theirs).score!;
    const bonused = tasteMatch(mine, theirs, { sameService: true, sameFavoriteArtist: true }).score!;
    expect(bonused - plain).toBe(14);
    expect(bonused).toBeLessThan(20);
  });

  it('stays within 0 and 100', () => {
    const mine = big('a');
    const match = tasteMatch(mine, mine, { sameService: true, sameFavoriteArtist: true });
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(100);
  });

  it('needs at least MIN_TASTE_DATA known songs before reporting', () => {
    const justUnder = buildTasteProfile(rows(['A', 'x']));
    expect(tasteMatch(justUnder, buildTasteProfile([])).score).toBeNull();
    const enough = buildTasteProfile(rows(['A', 'x'], ['B', 'y']));
    expect(enough.artists.size + enough.titles.size).toBeGreaterThanOrEqual(MIN_TASTE_DATA);
    expect(tasteMatch(enough, buildTasteProfile([])).score).not.toBeNull();
  });
});

describe('sameServiceBonus', () => {
  it('only applies when both sides actually have the same service', () => {
    expect(sameServiceBonus('spotify', 'spotify')).toBe(true);
    expect(sameServiceBonus('spotify', 'apple_music')).toBe(false);
    expect(sameServiceBonus(null, null)).toBe(false);
  });
});
