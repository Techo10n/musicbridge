import { EmptyPlaylistError, PlaylistDraft, SongDraft, sendShare, toTrackPayload } from '../lib/sharing';
import { LibraryTrack } from '../types';

const mockInsert = jest.fn();
const mockSelect = jest.fn();
const mockPush = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => mockFrom(table) },
}));
jest.mock('../lib/notifications', () => ({
  sendPushNotification: (recipientId: string, kind: string, itemId?: string) =>
    mockPush(recipientId, kind, itemId),
}));

const mockFrom = jest.fn((_table: string) => ({
  insert: (rows: unknown) => { mockInsert(rows); return { select: mockSelect }; },
}));

const track = (over: Partial<LibraryTrack> = {}): LibraryTrack => ({
  id: 'trk', title: 'Song', artist: 'Artist', coverUrl: 'http://art', service: 'spotify', ...over,
});

const song: SongDraft = {
  kind: 'song', title: 'Apocalypse', artist: 'Cigarettes After Sex',
  coverUrl: 'http://art', service: 'spotify', serviceId: 'sp1', isrc: 'US1234',
};

const playlist: PlaylistDraft = {
  kind: 'playlist', title: 'Night Drive', coverUrl: 'http://art',
  service: 'spotify', playlistId: 'pl1',
  tracks: [{ title: 'a', artist: 'b', spotify_id: 'x', apple_music_id: null, youtube_music_id: null }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSelect.mockResolvedValue({ data: [{ id: 'row1', recipient_id: 'u1' }], error: null });
});

describe('toTrackPayload', () => {
  it('stores the id only for the service the track came from, and carries the ISRC', () => {
    expect(toTrackPayload(track({ service: 'spotify', id: 'sp', isrc: 'US1' })))
      .toEqual({ title: 'Song', artist: 'Artist', isrc: 'US1', spotify_id: 'sp', apple_music_id: null, youtube_music_id: null });
    expect(toTrackPayload(track({ service: 'apple_music', id: 'am' })).apple_music_id).toBe('am');
  });

  it('refuses a YouTube id that is not from a Topic channel', () => {
    expect(toTrackPayload(track({ service: 'youtube_music', id: 'vid' })).youtube_music_id).toBeNull();
    expect(toTrackPayload(track({ service: 'youtube_music', id: 'vid', ytTopicVerified: true })).youtube_music_id).toBe('vid');
  });
});

describe('sendShare', () => {
  it('writes one row per recipient and notifies each', async () => {
    mockSelect.mockResolvedValue({
      data: [{ id: 'r1', recipient_id: 'u1' }, { id: 'r2', recipient_id: 'u2' }],
      error: null,
    });

    const result = await sendShare('me', song, ['u1', 'u2'], 'listen to this');

    const rows = mockInsert.mock.calls[0][0] as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sender_id: 'me', recipient_id: 'u1', type: 'song',
      title: 'Apocalypse', spotify_id: 'sp1', message: 'listen to this',
    });
    expect(rows[1]).toMatchObject({ recipient_id: 'u2' });
    expect(result.itemIds).toEqual(['r1', 'r2']);
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush).toHaveBeenCalledWith('u1', 'new_share', 'r1');
  });

  it('only fills the id column for the sender\'s own service', async () => {
    await sendShare('me', song, ['u1'], null);
    const row = (mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ spotify_id: 'sp1', apple_music_id: null, youtube_music_id: null });
  });

  it('drops an unverified YouTube id rather than sending something unplayable', async () => {
    const yt: SongDraft = { ...song, service: 'youtube_music', serviceId: 'vid' };
    await sendShare('me', yt, ['u1'], null);
    expect((mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0]).toMatchObject({ youtube_music_id: null });

    jest.clearAllMocks();
    await sendShare('me', { ...yt, ytTopicVerified: true }, ['u1'], null);
    expect((mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0]).toMatchObject({ youtube_music_id: 'vid' });
  });

  it('turns an empty note into null rather than an empty string', async () => {
    await sendShare('me', song, ['u1'], null);
    expect((mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0]).toMatchObject({ message: null });
  });

  it('refuses a playlist whose tracks failed to load', async () => {
    await expect(sendShare('me', { ...playlist, tracks: [] }, ['u1'], null))
      .rejects.toBeInstanceOf(EmptyPlaylistError);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses to send to nobody', async () => {
    await expect(sendShare('me', song, [], null)).rejects.toThrow(/at least one/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('sends a playlist with its tracks attached', async () => {
    await sendShare('me', playlist, ['u1'], null);
    expect((mockInsert.mock.calls[0][0] as Record<string, unknown>[])[0]).toMatchObject({
      type: 'playlist', spotify_playlist_id: 'pl1', artist: null, tracks: playlist.tracks,
    });
  });

  it('surfaces a database error instead of reporting success', async () => {
    mockSelect.mockResolvedValue({ data: null, error: new Error('rls denied') });
    await expect(sendShare('me', song, ['u1'], null)).rejects.toThrow('rls denied');
    expect(mockPush).not.toHaveBeenCalled();
  });
});
