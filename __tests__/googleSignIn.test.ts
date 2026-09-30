import { AUTH_CANCELLED, getGoogleIdToken } from '../lib/googleSignIn';

const IDS = { iosClientId: 'ios-id', webClientId: 'web-id' };

const mockConfigure = jest.fn();
const mockHasPlayServices = jest.fn().mockResolvedValue(true);
const mockSignIn = jest.fn();
let mockImportThrows = false;

jest.mock('@react-native-google-signin/google-signin', () => {
  if (mockImportThrows) throw new Error('RNGoogleSignin could not be found');
  return {
    GoogleSignin: {
      configure: mockConfigure,
      hasPlayServices: mockHasPlayServices,
      signIn: mockSignIn,
    },
    isErrorWithCode: (err: unknown) => typeof (err as { code?: string })?.code === 'string',
    statusCodes: { SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED' },
  };
});

beforeEach(() => {
  mockImportThrows = false;
  jest.clearAllMocks();
  mockHasPlayServices.mockResolvedValue(true);
});

describe('getGoogleIdToken', () => {
  it('returns the identity token from the native sheet', async () => {
    mockSignIn.mockResolvedValue({ data: { idToken: 'tok_123' } });
    await expect(getGoogleIdToken(IDS)).resolves.toBe('tok_123');
  });

  it('passes both client ids, since Supabase verifies against the web one', async () => {
    mockSignIn.mockResolvedValue({ data: { idToken: 'tok_123' } });
    await getGoogleIdToken(IDS);
    expect(mockConfigure).toHaveBeenCalledWith({ iosClientId: 'ios-id', webClientId: 'web-id' });
  });

  it('reports a cancellation as cancellation, not as a failure to show the user', async () => {
    mockSignIn.mockRejectedValue(Object.assign(new Error('user cancelled'), { code: 'SIGN_IN_CANCELLED' }));
    await expect(getGoogleIdToken(IDS)).rejects.toThrow(AUTH_CANCELLED);
  });

  it('surfaces any other native error unchanged', async () => {
    mockSignIn.mockRejectedValue(Object.assign(new Error('network down'), { code: 'NETWORK_ERROR' }));
    await expect(getGoogleIdToken(IDS)).rejects.toThrow('network down');
  });

  it('refuses a sheet that succeeded without a token rather than returning null', async () => {
    mockSignIn.mockResolvedValue({ data: {} });
    await expect(getGoogleIdToken(IDS)).rejects.toThrow(/identity token/i);
  });

  /**
   * The package binds with TurboModuleRegistry.getEnforcing, which throws at
   * IMPORT time when the native module is missing — a stale binary, a
   * teammate who skipped pod install, Expo Go. A static import would take the
   * whole app down, because useAuth is imported by the root layout.
   */
  it('contains a missing native module to this call instead of the whole app', async () => {
    mockImportThrows = true;
    // The registry caches the first successful require, so the factory only
    // runs again after a reset.
    jest.resetModules();
    await expect(getGoogleIdToken(IDS)).rejects.toThrow(/rebuild/i);
  });
});
