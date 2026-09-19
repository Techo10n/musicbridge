import { isMusicService, serviceLabel, serviceLabelShort } from '../lib/services';
import { serviceColor, palettes } from '../lib/theme';
import { monthWeekLabel, timeAgo } from '../lib/utils';

describe('service labels', () => {
  it('formats known service ids and leaves unknown values alone', () => {
    expect(serviceLabel('spotify')).toBe('Spotify');
    expect(serviceLabel('apple_music')).toBe('Apple Music');
    expect(serviceLabelShort('youtube_music')).toBe('YT Music');
    expect(serviceLabelShort('tidal')).toBe('tidal');
    expect(serviceLabel(null)).toBe('');
  });

  it('guards service ids', () => {
    expect(isMusicService('spotify')).toBe(true);
    expect(isMusicService('deezer')).toBe(false);
  });

  it('maps a service to its brand color in either palette', () => {
    expect(serviceColor(palettes.light, 'apple_music')).toBe(palettes.light.appleMusic);
    expect(serviceColor(palettes.dark, 'nope')).toBe(palettes.dark.text3);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-09-18T12:00:00Z').getTime();
  const at = (ms: number) => new Date(now - ms).toISOString();

  it('rounds down to the largest whole unit', () => {
    expect(timeAgo(at(5_000), now)).toBe('now');
    expect(timeAgo(at(90_000), now)).toBe('1m');
    expect(timeAgo(at(3 * 3_600_000), now)).toBe('3h');
    expect(timeAgo(at(2 * 86_400_000), now)).toBe('2d');
  });

  it('never reads as negative or invalid', () => {
    expect(timeAgo(new Date(now + 60_000).toISOString(), now)).toBe('now');
    expect(timeAgo('garbage', now)).toBe('now');
  });

  it('switches to a short date after a week', () => {
    expect(timeAgo(at(10 * 86_400_000), now)).toMatch(/Sep 8/);
  });
});

describe('monthWeekLabel', () => {
  it('reports the month and ISO week of the given date', () => {
    expect(monthWeekLabel(new Date('2026-09-20T12:00:00Z'))).toBe('SEP · WK 38');
    expect(monthWeekLabel(new Date('2026-01-01T12:00:00Z'))).toBe('JAN · WK 1');
  });

  it('puts a year-end date in the week its Thursday belongs to', () => {
    // 2026-12-31 is a Thursday, so ISO-8601 puts it in week 53 of 2026.
    expect(monthWeekLabel(new Date('2026-12-31T12:00:00Z'))).toBe('DEC · WK 53');
  });
});
