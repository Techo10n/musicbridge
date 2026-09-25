import { Conversion, activeConversion, conversionErrorMessage } from '../hooks/useConversions';

jest.mock('../lib/supabase', () => ({ supabase: {} }));

const run = (over: Partial<Conversion>): Conversion => ({
  itemId: 'i', title: 'Night Drive', state: 'processing',
  processed: 3, total: 10, matched: null, unmatched: [],
  quotaExhausted: false, playlistId: null, playlistUrl: null,
  failure: null, service: 'spotify',
  ...over,
});

describe('activeConversion', () => {
  it('finds the one still going', () => {
    const map = { a: run({ itemId: 'a', state: 'done' }), b: run({ itemId: 'b', state: 'processing' }) };
    expect(activeConversion(map)?.itemId).toBe('b');
  });

  it('counts a queued run as active, since the user is waiting on it', () => {
    expect(activeConversion({ a: run({ state: 'waiting' }) })?.itemId).toBe('i');
  });

  it('returns nothing when everything has finished or failed', () => {
    expect(activeConversion({ a: run({ state: 'done' }), b: run({ itemId: 'b', state: 'failed' }) })).toBeNull();
    expect(activeConversion({})).toBeNull();
  });
});

describe('conversionErrorMessage', () => {
  const on = (failure: string | null) => conversionErrorMessage(failure, 'spotify', 'Spotify');

  it('explains a quota failure as temporary, and says when to come back', () => {
    expect(on('spotify_rate_limit_exceeded')).toMatch(/12 hours/);
    expect(on('youtube_quota_exceeded')).toMatch(/tomorrow/);
  });

  it('points an auth failure at the fix', () => {
    expect(on('spotify_token_refresh_failed')).toMatch(/Reconnect it in Settings/);
    expect(on('apple_music_auth_failed')).toMatch(/Reconnect it in Settings/);
    expect(on('not_connected')).toMatch(/Connect it in Settings/);
  });

  it('does not report an auth or quota failure as "nothing matched"', () => {
    // The whole run aborts on these, so blaming the music would be a lie.
    for (const code of ['spotify_auth_failed', 'youtube_quota_exceeded', 'spotify_permission_denied']) {
      expect(on(code)).not.toMatch(/turned up|matched/i);
    }
  });

  it('names the service it is talking about', () => {
    expect(conversionErrorMessage('not_connected', 'apple_music', 'Apple Music')).toMatch(/Apple Music/);
  });

  it('still says something useful for an unknown code or none at all', () => {
    expect(on(null)).toMatch(/try again/i);
    expect(on('something_new')).toContain('something_new');
  });
});
