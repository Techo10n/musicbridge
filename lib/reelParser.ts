/**
 * Reel URL parsing utilities.
 *
 * Structured for easy TikTok extension: add TikTok patterns to REEL_PATTERNS
 * and the rest of the app (clipboard detection, edge function routing) will
 * pick them up automatically.
 */

export type ReelPlatform = 'instagram' | 'tiktok';

export interface ParsedReelUrl {
  platform: ReelPlatform;
  shortcode: string;
  originalUrl: string;
}

export interface ReelSong {
  title: string;
  artist: string;
  coverUrl: string | null;
}

export interface ParseReelResult {
  songs: ReelSong[];
  /** Which stages contributed — may be a '+'-joined combination e.g. "fingerprint+vision" */
  source: string;
}

const REEL_PATTERNS: Record<ReelPlatform, RegExp[]> = {
  instagram: [
    /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)(?:[/?#][^\s]*)?/i,
  ],
  // Ready for TikTok — just needs the parse-reel edge function extended
  tiktok: [
    /(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@[\w.]+\/video\/(\d+)(?:[/?#][^\s]*)?/i,
    /(?:https?:\/\/)?vm\.tiktok\.com\/([A-Za-z0-9]+)(?:[/?#][^\s]*)?/i,
  ],
};

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[)\].,!?]+$/, '');
}

export function parseReelUrl(text: string): ParsedReelUrl | null {
  for (const [platform, patterns] of Object.entries(REEL_PATTERNS) as [ReelPlatform, RegExp[]][]) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          platform,
          shortcode: match[1],
          originalUrl: trimTrailingPunctuation(match[0]),
        };
      }
    }
  }
  return null;
}

export function isReelUrl(text: string): boolean {
  return parseReelUrl(text) !== null;
}
