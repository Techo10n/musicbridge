import { appStoreUrl, appVersion, privacyUrl, supportMailto, termsUrl } from '../lib/support';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0', ios: { buildNumber: '14' } } },
}));

const KEYS = [
  'EXPO_PUBLIC_TERMS_URL', 'EXPO_PUBLIC_PRIVACY_URL',
  'EXPO_PUBLIC_SUPPORT_EMAIL', 'EXPO_PUBLIC_APP_STORE_ID',
];

beforeEach(() => { for (const key of KEYS) delete process.env[key]; });

describe('configured links', () => {
  it('reports nothing when a destination is not configured', () => {
    expect(termsUrl()).toBeNull();
    expect(privacyUrl()).toBeNull();
    expect(appStoreUrl()).toBeNull();
    expect(supportMailto('Help')).toBeNull();
  });

  it('treats whitespace as unconfigured, so a blank env var hides the row', () => {
    process.env.EXPO_PUBLIC_TERMS_URL = '   ';
    expect(termsUrl()).toBeNull();
  });

  it('returns the configured destination, trimmed', () => {
    process.env.EXPO_PUBLIC_PRIVACY_URL = ' https://museaic.app/privacy ';
    expect(privacyUrl()).toBe('https://museaic.app/privacy');
  });

  it('builds a review link from the App Store id', () => {
    process.env.EXPO_PUBLIC_APP_STORE_ID = '6501234567';
    expect(appStoreUrl()).toBe('https://apps.apple.com/app/id6501234567?action=write-review');
  });
});

describe('appVersion', () => {
  it('reports the running version and build, not a typed-in string', () => {
    expect(appVersion()).toBe('1.2.0 (14)');
  });
});

describe('supportMailto', () => {
  beforeEach(() => { process.env.EXPO_PUBLIC_SUPPORT_EMAIL = 'help@museaic.app'; });

  it('addresses the configured mailbox and escapes the subject', () => {
    const link = supportMailto('Delete my account');
    expect(link).toContain('mailto:help@museaic.app');
    expect(link).toContain('subject=Delete%20my%20account');
  });

  it('identifies the account so support does not have to ask', () => {
    const body = decodeURIComponent(supportMailto('Feedback', 'zech')!.split('body=')[1]);
    expect(body).toContain('Account: @zech');
    expect(body).toContain('Museaic 1.2.0 (14)');
  });

  it('omits the account line when signed out', () => {
    const body = decodeURIComponent(supportMailto('Feedback')!.split('body=')[1]);
    expect(body).not.toContain('Account:');
  });
});
