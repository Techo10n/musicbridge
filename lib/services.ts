import { MusicService } from '../types';

/** The one place that knows how each streaming service is named. */
export const SERVICES: readonly MusicService[] = ['spotify', 'apple_music', 'youtube_music'] as const;

const LABELS: Record<MusicService, { label: string; short: string; connectHint: string }> = {
  spotify: { label: 'Spotify', short: 'Spotify', connectHint: 'Connect your Spotify account' },
  apple_music: { label: 'Apple Music', short: 'Apple Music', connectHint: 'Connect via MusicKit' },
  youtube_music: { label: 'YouTube Music', short: 'YT Music', connectHint: 'Connect via Google account' },
};

export function isMusicService(value: unknown): value is MusicService {
  return value === 'spotify' || value === 'apple_music' || value === 'youtube_music';
}

/** Full display name, e.g. "Apple Music". Unknown ids pass through unchanged. */
export function serviceLabel(service: MusicService | string | null | undefined): string {
  return isMusicService(service) ? LABELS[service].label : String(service ?? '');
}

/** Compact display name for tight rows, e.g. "YT Music". */
export function serviceLabelShort(service: MusicService | string | null | undefined): string {
  return isMusicService(service) ? LABELS[service].short : String(service ?? '');
}

export function serviceConnectHint(service: MusicService): string {
  return LABELS[service].connectHint;
}
