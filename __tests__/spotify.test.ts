/**
 * getSpotifyAccessToken refreshes an expired token by POSTing to Spotify's
 * token endpoint. Spotify rotates refresh tokens on every use, so two
 * concurrent callers each doing their own refresh can invalidate each
 * other's new refresh token — see gotchas.md / decisions.md. This tests the
 * single-flight dedupe fix: concurrent calls for the same user must share
 * one in-flight refresh instead of each firing their own request.
 */

const mockSingle = jest.fn();
const mockSelectEq = jest.fn(() => ({ single: mockSingle }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
const mockUpdateEq = jest.fn(() => Promise.resolve({ error: null }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect, update: mockUpdate }));

jest.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn(),
  makeRedirectUri: jest.fn(),
  exchangeCodeAsync: jest.fn(),
}));

describe('getSpotifyAccessToken', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('dedupes concurrent refreshes for the same user into a single network call', async () => {
    mockSingle.mockResolvedValue({
      data: {
        spotify_access_token: 'stale-token',
        spotify_refresh_token: 'refresh-token',
        // Already expired
        spotify_token_expiry: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });

    let resolveFetch: (value: unknown) => void = () => {};
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
    const fetchMock = jest.fn(() => fetchPromise);
    // @ts-expect-error test override
    global.fetch = fetchMock;

    const { getSpotifyAccessToken } = require('../lib/spotify');

    const call1 = getSpotifyAccessToken('user-1');
    const call2 = getSpotifyAccessToken('user-1');

    // Let both calls reach the point of calling fetch before resolving it.
    await Promise.resolve();
    await Promise.resolve();

    resolveFetch({
      ok: true,
      json: async () => ({ access_token: 'fresh-token', refresh_token: 'new-refresh', expires_in: 3600 }),
    });

    const [token1, token2] = await Promise.all([call1, call2]);

    expect(token1).toBe('fresh-token');
    expect(token2).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Only one row read and one row write should have happened per refresh cycle.
    expect(mockSingle).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not dedupe refreshes for different users', async () => {
    mockSingle.mockResolvedValue({
      data: {
        spotify_access_token: 'stale-token',
        spotify_refresh_token: 'refresh-token',
        spotify_token_expiry: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ access_token: 'fresh-token', expires_in: 3600 }),
    }));
    // @ts-expect-error test override
    global.fetch = fetchMock;

    const { getSpotifyAccessToken } = require('../lib/spotify');

    await Promise.all([getSpotifyAccessToken('user-1'), getSpotifyAccessToken('user-2')]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
