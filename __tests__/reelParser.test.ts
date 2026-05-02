import { isReelUrl, parseReelUrl } from '../lib/reelParser';

describe('parseReelUrl', () => {
  it('parses Instagram reel and post URLs embedded in text', () => {
    expect(parseReelUrl('check this https://www.instagram.com/reel/Cabc_123-def/?igsh=abc')).toEqual({
      platform: 'instagram',
      shortcode: 'Cabc_123-def',
      originalUrl: 'https://www.instagram.com/reel/Cabc_123-def/?igsh=abc',
    });

    expect(parseReelUrl('instagram.com/p/POST_42')).toEqual({
      platform: 'instagram',
      shortcode: 'POST_42',
      originalUrl: 'instagram.com/p/POST_42',
    });
  });

  it('trims punctuation that often follows pasted links', () => {
    expect(parseReelUrl('(https://www.instagram.com/reel/ABC123/).')?.originalUrl).toBe(
      'https://www.instagram.com/reel/ABC123/',
    );
  });

  it('parses supported TikTok URL formats', () => {
    expect(parseReelUrl('https://www.tiktok.com/@musicbridge/video/7351234567890?lang=en')).toEqual({
      platform: 'tiktok',
      shortcode: '7351234567890',
      originalUrl: 'https://www.tiktok.com/@musicbridge/video/7351234567890?lang=en',
    });

    expect(parseReelUrl('vm.tiktok.com/ZMabc123/')).toEqual({
      platform: 'tiktok',
      shortcode: 'ZMabc123',
      originalUrl: 'vm.tiktok.com/ZMabc123/',
    });
  });

  it('returns null for unsupported URLs and text', () => {
    expect(parseReelUrl('https://youtube.com/watch?v=abc')).toBeNull();
    expect(parseReelUrl('not a reel')).toBeNull();
  });
});

describe('isReelUrl', () => {
  it('returns true only when a supported reel URL is present', () => {
    expect(isReelUrl('https://instagram.com/reel/ABC')).toBe(true);
    expect(isReelUrl('https://example.com/reel/ABC')).toBe(false);
  });
});
