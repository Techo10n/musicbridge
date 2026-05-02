import { ReelSong } from '../lib/reelParser';

type SupabaseState = {
  selectResult: { data: any[] | null; error: any };
  savedImport: { id: string; title: string; reel_url: string; created_at: string };
  importError: any;
  rpcError: any;
  deleteError: any;
  from: jest.Mock;
  rpc: jest.Mock;
};

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStorage.get(key) ?? null)),
  setItem: jest.fn((key: string, value: string) => {
    mockStorage.set(key, value);
    return Promise.resolve();
  }),
  removeItem: jest.fn((key: string) => {
    mockStorage.delete(key);
    return Promise.resolve();
  }),
}));

function makeSupabaseState(): SupabaseState {
  const state: SupabaseState = {
    selectResult: { data: [], error: null },
    savedImport: {
      id: 'remote-1',
      title: 'Remote list',
      reel_url: 'https://instagram.com/reel/remote',
      created_at: '2026-04-30T00:00:00.000Z',
    },
    importError: null,
    rpcError: null,
    deleteError: null,
    from: jest.fn((table: string) => {
      if (table === 'reel_imports') return makeReelImportsQuery(state);
      throw new Error(`Unexpected table: ${table}`);
    }),
    rpc: jest.fn(() => Promise.resolve({ error: state.rpcError })),
  };
  return state;
}

function makeReelImportsQuery(state: SupabaseState) {
  let orderCalls = 0;
  const query: any = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => {
      orderCalls += 1;
      if (orderCalls === 2) return Promise.resolve(state.selectResult);
      return query;
    }),
    upsert: jest.fn(() => query),
    single: jest.fn(() => Promise.resolve({
      data: state.importError ? null : state.savedImport,
      error: state.importError,
    })),
    delete: jest.fn(() => query),
  };

  query.eq.mockImplementation(() => {
    if (query.delete.mock.calls.length > 0 && query.eq.mock.calls.length >= 2) {
      return Promise.resolve({ error: state.deleteError });
    }
    return query;
  });

  return query;
}

async function importReelLists(state = makeSupabaseState()) {
  jest.resetModules();
  jest.doMock('../lib/supabase', () => ({
    supabase: {
      from: state.from,
      rpc: state.rpc,
    },
  }));

  const mod = require('../lib/reelLists');
  return { ...mod, state };
}

const song: ReelSong = {
  title: 'Song',
  artist: 'Artist',
  coverUrl: 'https://example.com/cover.jpg',
};

describe('reelLists', () => {
  let consoleWarn: jest.SpyInstance;

  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    jest.useRealTimers();
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
  });

  it('reads and normalizes remote reel lists in song order', async () => {
    const state = makeSupabaseState();
    state.selectResult = {
      error: null,
      data: [{
        id: 'list-1',
        title: 'Saved reel',
        reel_url: 'https://instagram.com/reel/abc',
        created_at: '2026-04-30T00:00:00.000Z',
        reel_import_songs: [
          { position: 1, title: 'Second', artist: 'B', cover_url: null },
          { position: 0, title: 'First', artist: 'A', cover_url: 'cover' },
        ],
      }],
    };

    const { getSavedReelLists } = await importReelLists(state);

    await expect(getSavedReelLists('user-1')).resolves.toEqual([{
      id: 'list-1',
      title: 'Saved reel',
      reelUrl: 'https://instagram.com/reel/abc',
      createdAt: '2026-04-30T00:00:00.000Z',
      songs: [
        { title: 'First', artist: 'A', coverUrl: 'cover' },
        { title: 'Second', artist: 'B', coverUrl: null },
      ],
    }]);
  });

  it('saves remote reel lists through the atomic RPC', async () => {
    const state = makeSupabaseState();
    state.savedImport = {
      id: 'remote-1',
      title: 'Reel list - Apr 30, 2026 - 1 song',
      reel_url: 'https://instagram.com/reel/abc',
      created_at: '2026-04-30T00:00:00.000Z',
    };
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T00:00:00.000Z'));

    const { saveReelList } = await importReelLists(state);
    const saved = await saveReelList('user-1', 'https://instagram.com/reel/abc', [song]);

    expect(saved).toEqual({
      id: 'remote-1',
      title: 'Reel list - Apr 30, 2026 - 1 song',
      reelUrl: 'https://instagram.com/reel/abc',
      songs: [song],
      createdAt: '2026-04-30T00:00:00.000Z',
    });
    expect(state.rpc).toHaveBeenCalledWith('upsert_reel_import_songs', {
      p_reel_import_id: 'remote-1',
      p_songs: [{
        position: 0,
        title: 'Song',
        artist: 'Artist',
        cover_url: 'https://example.com/cover.jpg',
      }],
    });
  });

  it('falls back to local storage when remote history is unavailable', async () => {
    const state = makeSupabaseState();
    state.selectResult = { data: null, error: new Error('remote down') };
    state.importError = new Error('remote down');
    jest.useFakeTimers().setSystemTime(new Date('2026-04-30T00:00:00.000Z'));

    const { saveReelList, getSavedReelLists } = await importReelLists(state);
    const saved = await saveReelList('user-1', 'https://instagram.com/reel/local', [song]);
    const lists = await getSavedReelLists('user-1');

    expect(saved.reelUrl).toBe('https://instagram.com/reel/local');
    expect(lists).toHaveLength(1);
    expect(lists[0].songs).toEqual([song]);
  });

  it('removes only successfully migrated local lists', async () => {
    const storageKey = 'saved_reel_lists_user-1';
    mockStorage.set(storageKey, JSON.stringify([
      { id: 'local-1', title: 'One', reelUrl: 'https://instagram.com/reel/one', songs: [song], createdAt: '2026-04-30T00:00:00.000Z' },
      { id: 'local-2', title: 'Two', reelUrl: 'https://instagram.com/reel/two', songs: [song], createdAt: '2026-04-29T00:00:00.000Z' },
    ]));

    const state = makeSupabaseState();
    state.selectResult = { data: [], error: null };
    state.rpc
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error('insert failed') });

    const { getSavedReelLists } = await importReelLists(state);
    const migrated = await getSavedReelLists('user-1');

    expect(migrated).toHaveLength(1);
    expect(JSON.parse(mockStorage.get(storageKey) ?? '[]')).toEqual([
      expect.objectContaining({ id: 'local-2' }),
    ]);
  });
});
