/**
 * Covers two fixes in lib/youtubeMusic.ts:
 *  1. getYouTubeAccessToken dedupes concurrent refreshes for the same user
 *     (same shape as the Spotify fix — see spotify.test.ts).
 *  2. getPlaylistTracks tags each track with `ytTopicVerified`, computed from
 *     the channel title already returned by the playlistItems call, so
 *     callers never trust a non-"Artist - Topic" video id as a canonical
 *     Song id (see decisions.md "Never add non-Topic videos to YouTube
 *     Music").
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

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-auth-session', () => ({
  AuthRequest: jest.fn(),
  makeRedirectUri: jest.fn(),
  exchangeCodeAsync: jest.fn(),
}));

function mockValidToken() {
  mockSingle.mockResolvedValue({
    data: {
      youtube_access_token: 'valid-token',
      youtube_refresh_token: 'refresh-token',
      youtube_token_expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    error: null,
  });
}

describe('getYouTubeAccessToken', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('dedupes concurrent refreshes for the same user into a single network call', async () => {
    mockSingle.mockResolvedValue({
      data: {
        youtube_access_token: 'stale-token',
        youtube_refresh_token: 'refresh-token',
        youtube_token_expiry: new Date(Date.now() - 60_000).toISOString(),
      },
      error: null,
    });

    let resolveFetch: (value: unknown) => void = () => {};
    const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
    const fetchMock = jest.fn(() => fetchPromise);
    // @ts-expect-error test override
    global.fetch = fetchMock;

    const { getYouTubeAccessToken } = require('../lib/youtubeMusic');

    const call1 = getYouTubeAccessToken('user-1');
    const call2 = getYouTubeAccessToken('user-1');

    await Promise.resolve();
    await Promise.resolve();

    resolveFetch({ ok: true, json: async () => ({ access_token: 'fresh-token', expires_in: 3600 }) });

    const [token1, token2] = await Promise.all([call1, call2]);

    expect(token1).toBe('fresh-token');
    expect(token2).toBe('fresh-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getPlaylistTracks ytTopicVerified tagging', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockValidToken();
  });

  it('marks tracks from an "Artist - Topic" channel as verified and others as unverified', async () => {
    const playlistItemsResponse = {
      items: [
        {
          snippet: {
            title: 'Song One',
            videoOwnerChannelTitle: 'Real Artist - Topic',
            resourceId: { videoId: 'topic-video-id' },
            thumbnails: { medium: { url: 'https://example.com/a.jpg' } },
          },
        },
        {
          snippet: {
            title: 'Song Two (Official Video)',
            videoOwnerChannelTitle: 'Real Artist VEVO',
            resourceId: { videoId: 'vevo-video-id' },
            thumbnails: { medium: { url: 'https://example.com/b.jpg' } },
          },
        },
      ],
    };
    const videosResponse = {
      items: [
        { id: 'topic-video-id', snippet: { categoryId: '10', description: '', tags: [] } },
        { id: 'vevo-video-id', snippet: { categoryId: '10', description: '', tags: [] } },
      ],
    };

    const fetchMock = jest.fn(async (url: string) => {
      if (url.includes('/playlistItems')) {
        return { ok: true, json: async () => playlistItemsResponse };
      }
      if (url.includes('/videos')) {
        return { ok: true, json: async () => videosResponse };
      }
      return { ok: false, json: async () => ({}) };
    });
    // @ts-expect-error test override
    global.fetch = fetchMock;

    const { getPlaylistTracks } = require('../lib/youtubeMusic');
    const tracks = await getPlaylistTracks('user-1', 'PL123');

    const topicTrack = tracks.find((t: { id: string }) => t.id === 'topic-video-id');
    const vevoTrack = tracks.find((t: { id: string }) => t.id === 'vevo-video-id');

    expect(topicTrack?.ytTopicVerified).toBe(true);
    expect(vevoTrack?.ytTopicVerified).toBe(false);
  });
});
