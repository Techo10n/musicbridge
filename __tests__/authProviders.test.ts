/**
 * The provider list is read from the environment at module load, so each case
 * sets the variable and then re-imports.
 */
const loadWith = (value: string | undefined, platform: 'ios' | 'android' = 'ios') => {
  jest.resetModules();
  if (value === undefined) delete process.env.EXPO_PUBLIC_AUTH_PROVIDERS;
  else process.env.EXPO_PUBLIC_AUTH_PROVIDERS = value;
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
