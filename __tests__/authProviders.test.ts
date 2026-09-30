/**
 * The provider list is read from the environment at module load, so each case
 * sets the variable and then re-imports.
 */
const GOOGLE_IDS = {
  // The iOS client is the one YouTube Music already uses; its reverse is the
  // URL scheme registered in Info.plist, so the two cannot be allowed to drift.
  EXPO_PUBLIC_GOOGLE_CLIENT_ID: '123-ios.apps.googleusercontent.com',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-web.apps.googleusercontent.com',
};

const loadWith = (
  value: string | undefined,
  platform: 'ios' | 'android' = 'ios',
  googleIds: Partial<typeof GOOGLE_IDS> = GOOGLE_IDS,
) => {
  jest.resetModules();
  if (value === undefined) delete process.env.EXPO_PUBLIC_AUTH_PROVIDERS;
  else process.env.EXPO_PUBLIC_AUTH_PROVIDERS = value;
  for (const key of Object.keys(GOOGLE_IDS) as (keyof typeof GOOGLE_IDS)[]) {
    if (googleIds[key]) process.env[key] = googleIds[key];
    else delete process.env[key];
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require('react-native');
  Object.defineProperty(RN.Platform, 'OS', { get: () => platform, configurable: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../lib/authProviders') as typeof import('../lib/authProviders');
};

const original = process.env.EXPO_PUBLIC_AUTH_PROVIDERS;
afterAll(() => { process.env.EXPO_PUBLIC_AUTH_PROVIDERS = original; });

describe('enabledSocialProviders', () => {
  it('offers nothing when the variable is unset, so email is the only route', () => {
    expect(loadWith(undefined).enabledSocialProviders()).toEqual([]);
  });

  it('offers exactly what is listed', () => {
    expect(loadWith('apple,google').enabledSocialProviders()).toEqual(['apple', 'google']);
    expect(loadWith('google').enabledSocialProviders()).toEqual(['google']);
  });

  it('tolerates whitespace, casing and empty entries', () => {
    expect(loadWith(' Apple , ,GOOGLE ').enabledSocialProviders()).toEqual(['apple', 'google']);
  });

  it('ignores names that are not providers', () => {
    expect(loadWith('facebook,apple').enabledSocialProviders()).toEqual(['apple']);
  });

  it('never offers Apple off iOS, since only the native flow is set up', () => {
    expect(loadWith('apple,google', 'android').enabledSocialProviders()).toEqual(['google']);
  });
});

describe('Google needs its native client ids, not just the provider name', () => {
  // The native sheet is configured with these two ids. Without them the
  // package throws on the first tap, which is the broken button the whole
  // module exists to prevent.
  it('is offered when both ids are present', () => {
    expect(loadWith('google').enabledSocialProviders()).toEqual(['google']);
  });

  it('is withheld when the iOS id is missing', () => {
    const lib = loadWith('google', 'ios', { EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: GOOGLE_IDS.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
    expect(lib.enabledSocialProviders()).toEqual([]);
  });

  it('is withheld when the web id is missing, which is the easy one to forget', () => {
    const lib = loadWith('google', 'ios', { EXPO_PUBLIC_GOOGLE_CLIENT_ID: GOOGLE_IDS.EXPO_PUBLIC_GOOGLE_CLIENT_ID });
    expect(lib.enabledSocialProviders()).toEqual([]);
  });

  it('withholds Google but still offers Apple when only Google is unconfigured', () => {
    expect(loadWith('apple,google', 'ios', {}).enabledSocialProviders()).toEqual(['apple']);
  });

  it('reports both ids together, so the caller cannot configure half of it', () => {
    expect(loadWith('google').googleClientIds()).toEqual({
      iosClientId: GOOGLE_IDS.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
      webClientId: GOOGLE_IDS.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
    expect(loadWith('google', 'ios', {}).googleClientIds()).toBeNull();
  });
});
