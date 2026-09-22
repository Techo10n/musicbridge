/**
 * The one path that writes a share.
 *
 * Three screens used to build `shared_items` rows independently, with subtly
 * different rules about which service ids were safe to store. This module is
 * the single place that knows, so a rule fixed here is fixed everywhere.
 */
import { supabase } from './supabase';
import { sendPushNotification } from './notifications';
import { withTimeout } from './utils';
import { LibraryTrack, MusicService, Track } from '../types';

export interface SongDraft {
  kind: 'song';
  title: string;
  artist: string;
  coverUrl: string;
  /** The service the sender found it on, and therefore the only id we trust. */
  service: MusicService;
  serviceId: string;
  isrc?: string | null;
  /**
   * YouTube only: whether `serviceId` came from an "Artist - Topic" channel,
   * the only channel type YouTube Music treats as a Song.
   */
  ytTopicVerified?: boolean;
}

export interface PlaylistDraft {
  kind: 'playlist';
  title: string;
  coverUrl: string;
  service: MusicService;
  playlistId: string;
  tracks: Track[];
}

export type ShareDraft = SongDraft | PlaylistDraft;

/** Raised when a playlist's tracks could not be read. Carries a usable message. */
export class EmptyPlaylistError extends Error {
  constructor(title: string) {
    super(
      `No tracks came back for "${title}". Check that your music service is still connected in Settings, then try again.`,
    );
    this.name = 'EmptyPlaylistError';
  }
}

/**
 * Converts a library track into the payload stored on a shared playlist.
 *
 * `isrc` is carried because only the sender can obtain it: the recipient holds
 * a token for their own service only. With it, a Spotify <-> Apple Music
 * conversion is an exact lookup instead of a fuzzy title/artist search.
 */
export function toTrackPayload(t: LibraryTrack): Track {
  return {
    title: t.title,
    artist: t.artist,
    isrc: t.isrc ?? null,
    spotify_id: t.service === 'spotify' ? t.id : null,
    apple_music_id: t.service === 'apple_music' ? t.id : null,
    // A library playlist can hold a regular video that is not a canonical Song.
    // Sending its raw id would let the recipient build a mix-radio deep link to
    // something that is not a song, so send null and let their device
    // re-resolve by title and artist through the strict search path.
    youtube_music_id: t.service === 'youtube_music' && t.ytTopicVerified ? t.id : null,
  };
}

/** The per-service id columns for a song, with only the trustworthy one set. */
function songServiceIds(draft: SongDraft) {
  return {
    spotify_id: draft.service === 'spotify' ? draft.serviceId : null,
    apple_music_id: draft.service === 'apple_music' ? draft.serviceId : null,
    // Same Topic-channel rule as toTrackPayload: an unverified id is worse than
    // no id, because no id makes the recipient search properly.
    youtube_music_id: draft.service === 'youtube_music' && draft.ytTopicVerified ? draft.serviceId : null,
  };
}

function rowFor(draft: ShareDraft, senderId: string, recipientId: string, message: string | null) {
  const base = {
    sender_id: senderId,
    recipient_id: recipientId,
    cover_image_url: draft.coverUrl || '',
    message: message || null,
  };

  if (draft.kind === 'song') {
    return {
      ...base,
      type: 'song' as const,
      title: draft.title,
      artist: draft.artist,
      ...songServiceIds(draft),
    };
  }

  return {
    ...base,
    type: 'playlist' as const,
    title: draft.title,
    artist: null,
    spotify_playlist_id: draft.service === 'spotify' ? draft.playlistId : null,
    apple_music_playlist_id: draft.service === 'apple_music' ? draft.playlistId : null,
    youtube_music_playlist_id: draft.service === 'youtube_music' ? draft.playlistId : null,
    tracks: draft.tracks,
  };
}

export interface SendShareResult {
  /** Ids of the rows written, one per recipient. */
  itemIds: string[];
}

/**
 * Writes one row per recipient and notifies each of them.
 *
 * Refuses a playlist whose tracks failed to load: the share stores the track
 * list rather than a live reference, so sending an empty one writes something
 * the recipient can never recover, and neither side would learn of it. A
 * failure the sender can retry is the better outcome.
 */
export async function sendShare(
  senderId: string,
  draft: ShareDraft,
  recipientIds: string[],
  message: string | null,
): Promise<SendShareResult> {
  if (recipientIds.length === 0) throw new Error('Pick at least one person to send to');
  if (draft.kind === 'playlist' && draft.tracks.length === 0) throw new EmptyPlaylistError(draft.title);

  const rows = recipientIds.map((recipientId) => rowFor(draft, senderId, recipientId, message));

  const { data, error } = await withTimeout(
    Promise.resolve(supabase.from('shared_items').insert(rows).select('id, recipient_id')),
    15_000,
  );
  if (error) throw error;

  const inserted = (data ?? []) as { id: string; recipient_id: string }[];
  // Fire and forget: a share that landed should not read as failed because a
  // push could not be delivered.
  for (const row of inserted) {
    sendPushNotification(row.recipient_id, 'new_share', row.id);
  }

  return { itemIds: inserted.map((row) => row.id) };
}
