import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ShareComposer } from '../components/ShareComposer';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../components/ui';

const mockSendShare = jest.fn();
const mockSearchTracks = jest.fn();
const mockGetUserPlaylists = jest.fn();
const mockGetRecentlyPlayed = jest.fn();
const mockGetPlaylistTracks = jest.fn();

// lib/sharing imports the Supabase client, which refuses to construct without
// env vars. sendShare itself is mocked, so a stub is enough.
jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('../lib/notifications', () => ({ sendPushNotification: jest.fn() }));
jest.mock('../lib/sharing', () => {
  const actual = jest.requireActual('../lib/sharing');
  return { ...actual, sendShare: (...args: unknown[]) => mockSendShare(...args) };
});
jest.mock('../lib/spotify', () => ({
  searchTracks: (...a: unknown[]) => mockSearchTracks(...a),
  getUserPlaylists: (...a: unknown[]) => mockGetUserPlaylists(...a),
  getRecentlyPlayed: (...a: unknown[]) => mockGetRecentlyPlayed(...a),
}));
jest.mock('../lib/appleMusic', () => ({
  searchTracks: jest.fn(),
  getUserPlaylists: jest.fn(),
  getRecentlyPlayed: jest.fn(),
  resolveArtworkUrl: (u: string) => u,
}));
jest.mock('../lib/youtubeMusic', () => ({
  searchTracks: jest.fn(),
  getUserPlaylists: jest.fn(),
  extractYouTubeTrackInfo: (_c: string, t: string) => ({ title: t, artist: 'x' }),
}));
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me', primary_service: 'spotify' } }),
}));
jest.mock('../hooks/useFollows', () => ({
  useFollows: () => ({
    mutualFollows: [
      { id: 'u1', username: 'sam', display_name: 'Sam Lee', avatar_url: null },
      { id: 'u2', username: 'ash', display_name: 'Ash Ray', avatar_url: null },
    ],
    refresh: jest.fn(),
  }),
}));
jest.mock('../hooks/useLibrary', () => ({
  useLibrary: () => ({ getPlaylistTracks: (...a: unknown[]) => mockGetPlaylistTracks(...a) }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function open(props: Partial<React.ComponentProps<typeof ShareComposer>> = {}) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider scheme="light">
        <ToastProvider>
          <ShareComposer visible onClose={props.onClose ?? jest.fn()} {...props} />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

const spotifyTrack = {
  id: 'sp1',
  name: 'Apocalypse',
  artists: [{ name: 'Cigarettes After Sex' }],
  album: { name: 'CAS', images: [{ url: 'http://art', width: 300, height: 300 }] },
  uri: 'spotify:track:sp1',
  external_ids: { isrc: 'US1234' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchTracks.mockResolvedValue([spotifyTrack]);
  mockGetUserPlaylists.mockResolvedValue([
    { id: 'pl1', name: 'Night Drive', coverUrl: '', trackCount: 12, service: 'spotify' },
  ]);
  mockGetRecentlyPlayed.mockResolvedValue([]);
  mockGetPlaylistTracks.mockResolvedValue([
    { id: 't1', title: 'a', artist: 'b', coverUrl: '', service: 'spotify' },
  ]);
  mockSendShare.mockResolvedValue({ itemIds: ['row1'] });
});
// Real timers throughout: the loading skeleton runs an Animated.loop that never
// settles under fake timers, so act() would hang waiting for it.

describe('ShareComposer', () => {
  it('starts by asking what to send, not who to send to', async () => {
    const r = open();
    await waitFor(() => expect(r.getByText('What do you want to send?')).toBeTruthy());
  });

  it('searches the primary service and lets a result be chosen', async () => {
    const r = open();
    await waitFor(() => expect(r.getByPlaceholderText('Search Spotify')).toBeTruthy());

    fireEvent.changeText(r.getByPlaceholderText('Search Spotify'), 'apoc');

    await waitFor(() => expect(r.getByText('Apocalypse')).toBeTruthy());

    expect(mockSearchTracks).toHaveBeenCalledWith('me', 'apoc');
    fireEvent.press(r.getByText('Apocalypse'));
    await waitFor(() => expect(r.getByText('Sam Lee')).toBeTruthy());

    // Having chosen, it moves on to recipients.
    expect(r.getByText('Ash Ray')).toBeTruthy();
  });

  it('sends to everyone selected, with the note, through the shared path', async () => {
    const onClose = jest.fn();
    const r = open({ onClose });
    await waitFor(() => expect(r.getByPlaceholderText('Search Spotify')).toBeTruthy());

    fireEvent.changeText(r.getByPlaceholderText('Search Spotify'), 'apoc');

    await waitFor(() => expect(r.getByText('Apocalypse')).toBeTruthy());
    fireEvent.press(r.getByText('Apocalypse'));
    await waitFor(() => expect(r.getByText('Sam Lee')).toBeTruthy());

    fireEvent.press(r.getByText('Sam Lee'));
    fireEvent.press(r.getByText('Ash Ray'));
    fireEvent.changeText(r.getByPlaceholderText('Add a message'), 'for the drive');
    await act(async () => {
      fireEvent.press(r.getByText('Send to 2'));
    });

    expect(mockSendShare).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ kind: 'song', title: 'Apocalypse', serviceId: 'sp1', isrc: 'US1234' }),
      ['u1', 'u2'],
      'for the drive',
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('will not send with nobody selected', async () => {
    const r = open();
    await waitFor(() => expect(r.getByPlaceholderText('Search Spotify')).toBeTruthy());
    fireEvent.changeText(r.getByPlaceholderText('Search Spotify'), 'apoc');
    await waitFor(() => expect(r.getByText('Apocalypse')).toBeTruthy());
    fireEvent.press(r.getByText('Apocalypse'));
    await waitFor(() => expect(r.getByText('Send')).toBeTruthy());

    await act(async () => {
      fireEvent.press(r.getByText('Send'));
    });
    expect(mockSendShare).not.toHaveBeenCalled();
  });

  it('loads a playlist\'s tracks before it can be sent', async () => {
    const r = open();
    await waitFor(() => expect(r.getByText('Playlists')).toBeTruthy());

    fireEvent.press(r.getByText('Playlists'));
    await waitFor(() => expect(r.getByText('Night Drive')).toBeTruthy());
    fireEvent.press(r.getByText('Night Drive'));
    await waitFor(() => expect(mockGetPlaylistTracks).toHaveBeenCalledWith('pl1'));
    await waitFor(() => expect(r.getByText('Sam Lee')).toBeTruthy());

    fireEvent.press(r.getByText('Sam Lee'));
    await act(async () => {
      fireEvent.press(r.getByText('Send'));
    });

    expect(mockSendShare).toHaveBeenCalledWith(
      'me',
      expect.objectContaining({ kind: 'playlist', playlistId: 'pl1', tracks: [expect.anything()] }),
      ['u1'],
      null,
    );
  });

  it('refuses a playlist whose tracks did not load, and stays on the picker', async () => {
    mockGetPlaylistTracks.mockResolvedValue([]);
    const r = open();
    await waitFor(() => expect(r.getByText('Playlists')).toBeTruthy());

    fireEvent.press(r.getByText('Playlists'));
    await waitFor(() => expect(r.getByText('Night Drive')).toBeTruthy());
    fireEvent.press(r.getByText('Night Drive'));
    await waitFor(() => expect(mockGetPlaylistTracks).toHaveBeenCalled());

    expect(mockSendShare).not.toHaveBeenCalled();
    expect(r.getByText('Night Drive')).toBeTruthy();
  });

  it('opens straight on recipients when the caller already chose something', async () => {
    const r = open({
      draft: {
        kind: 'song',
        title: 'Given',
        artist: 'Someone',
        coverUrl: '',
        service: 'spotify',
        serviceId: 'x',
      },
    });
    await waitFor(() => expect(r.getByText('Sam Lee')).toBeTruthy());

    expect(r.queryByPlaceholderText('Search Spotify')).toBeNull();
  });

  it('preselects a recipient when opened from their profile', async () => {
    const r = open({
      draft: { kind: 'song', title: 'Given', artist: 'S', coverUrl: '', service: 'spotify', serviceId: 'x' },
      recipient: { id: 'u2', username: 'ash', display_name: 'Ash Ray', avatar_url: null } as never,
    });
    await waitFor(() => expect(r.getByText('Send')).toBeTruthy());

    await act(async () => {
      fireEvent.press(r.getByText('Send'));
    });
    expect(mockSendShare).toHaveBeenCalledWith('me', expect.anything(), ['u2'], null);
  });
});
