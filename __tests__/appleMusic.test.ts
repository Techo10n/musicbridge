import { getAppleMusicPlaylistDeepLink } from '../lib/appleMusic';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {},
}));

jest.mock('../modules/apple-music', () => ({
  getAppleMusicDiagnostics: jest.fn(),
  getAppleMusicModuleVersion: jest.fn(),
  requestMusicAuthorization: jest.fn(),
  requestMusicStorefrontCountryCode: jest.fn(),
  requestMusicUserToken: jest.fn(),
}));

describe('getAppleMusicPlaylistDeepLink', () => {
  it('never builds a link from the raw library id', () => {
    // The invariant, not the exact list: a library id is not deep-linkable and
    // `library/playlist/{id}` resolves to "item not available". Static library
    // routes are fine; anything containing the id is not.
    const id = 'p.test playlist';
    for (const url of getAppleMusicPlaylistDeepLink(id)) {
      expect(url).not.toContain(id);
      expect(url).not.toMatch(/library\/playlist\//);
    }
  });

  it('falls back to library routes when Apple exposes no canonical URL', () => {
    expect(getAppleMusicPlaylistDeepLink('p.test playlist')).toEqual([
      'music://music.apple.com/library/playlists',
      'https://music.apple.com/library/playlists',
      'music://music.apple.com/library',
      'https://music.apple.com/library',
    ]);
  });

  it('uses canonical Apple Music URLs when Apple exposes one', () => {
    expect(getAppleMusicPlaylistDeepLink('library-id', 'https://music.apple.com/us/playlist/demo/pl.123')).toEqual([
      'music://music.apple.com/us/playlist/demo/pl.123',
      'https://music.apple.com/us/playlist/demo/pl.123',
    ]);
  });
});
