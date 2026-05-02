import { cleanArtistName, cleanTitle, withTimeout } from '../lib/utils';

describe('cleanArtistName', () => {
  it('removes common platform/channel suffixes', () => {
    expect(cleanArtistName('Miles Davis - Topic')).toBe('Miles Davis');
    expect(cleanArtistName('RadioheadVEVO')).toBe('Radiohead');
    expect(cleanArtistName('AdeleOfficial')).toBe('Adele');
  });

  it('returns an empty string for empty input', () => {
    expect(cleanArtistName('')).toBe('');
  });
});

describe('cleanTitle', () => {
  it('removes platform-specific title suffixes used during matching', () => {
    expect(cleanTitle('Hotel California (2013 Remaster)')).toBe('Hotel California');
    expect(cleanTitle('Bohemian Rhapsody [Radio Edit]')).toBe('Bohemian Rhapsody');
    expect(cleanTitle('Blinding Lights (feat. The Weeknd)')).toBe('Blinding Lights');
    expect(cleanTitle('About You (Official Audio)')).toBe('About You');
    expect(cleanTitle('About You - Official Music Video')).toBe('About You');
  });

  it('preserves plain titles', () => {
    expect(cleanTitle('Sweet Disposition')).toBe('Sweet Disposition');
  });
});

describe('withTimeout', () => {
  it('resolves when the wrapped promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects with timeout when the wrapped promise takes too long', async () => {
    jest.useFakeTimers();
    const pending = new Promise<string>(() => {});
    const result = withTimeout(pending, 100);

    jest.advanceTimersByTime(100);
    await expect(result).rejects.toThrow('timeout');
    jest.useRealTimers();
  });
});
