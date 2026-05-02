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

import { getAppleMusicPlaylistDeepLink } from '../lib/appleMusic';

describe('getAppleMusicPlaylistDeepLink', () => {
  it('falls back to the generic library instead of guessing unavailable playlist URLs', () => {
    expect(getAppleMusicPlaylistDeepLink('p.test playlist')).toEqual([
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
