import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { sendPushNotification } from '../lib/notifications';
import { useAuth } from '../hooks/useAuth';
import { useFollows } from '../hooks/useFollows';
import { ReelSong } from '../lib/reelParser';
import { MusicService, User } from '../types';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { cleanArtistName, cleanTitle, withTimeout } from '../lib/utils';
import { saveReelList } from '../lib/reelLists';

type Stage = 'analyzing' | 'songList' | 'pickFriend' | 'sharing' | 'failed';

interface ReelImportModalProps {
  reelUrl: string | null;
  onClose: () => void;
}

interface ParseReelResponse {
  songs?: ReelSong[];
  debug?: string[];
  videoUrl?: string | null;
  videoDuration?: number | null;
  audioSongs?: Array<ReelSong & { orderHint?: number; matchCount?: number }>;
  metadataSong?: ReelSong | null;
  textSongs?: ReelSong[];
}

function normalizeSongKey(song: Pick<ReelSong, 'title' | 'artist'>): string {
  const normalizeArtist = (value: string) =>
    value
      .toLowerCase()
      .replace(/^the\s+/i, '')
      .replace(/\s+-\s+topic$/i, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const normalizeTitle = (value: string) =>
    value
      .toLowerCase()
      .replace(/\((?:[^)]*(?:remaster|live|intro|outro|version|edit|mix)[^)]*)\)/gi, '')
      .replace(/\[(?:[^\]]*(?:remaster|live|intro|outro|version|edit|mix)[^\]]*)\]/gi, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const norm = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${normalizeTitle(song.title)}::${normalizeArtist(song.artist)}`;
}

function deduplicateSongs(songs: ReelSong[]): ReelSong[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const key = normalizeSongKey(song);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

interface RankedSong extends ReelSong {
  score: number;
  orderHint: number;
  sources: Set<'audio' | 'vision' | 'metadata' | 'text'>;
  audioHits: number;
  visionHits: number;
  metadataHits: number;
  textHits: number;
}

function hasVariantQualifier(title: string): boolean {
  return /\b(remaster|live|intro|outro|version|edit|mix)\b/i.test(title);
}

function isSuspiciousStandaloneTitle(title: string): boolean {
  return /\b(intro|interlude|outro|skit|theme)\b/i.test(title);
}

function displayPreference(song: Pick<ReelSong, 'title' | 'artist' | 'coverUrl'>): number {
  const normalizedTitle = cleanTitle(song.title);
  const normalizedArtist = cleanArtistName(song.artist);
  const titlePenalty = Math.max(0, song.title.length - normalizedTitle.length);
  const artistPenalty = Math.max(0, song.artist.length - normalizedArtist.length);
  const allCapsPenalty = song.artist === song.artist.toUpperCase() ? 2 : 0;

  return (
    (song.coverUrl ? 4 : 0)
    + (hasVariantQualifier(song.title) ? -6 : 3)
    - titlePenalty
    - artistPenalty
    - allCapsPenalty
  );
}

function rankSongs(params: {
  audioSongs: Array<ReelSong & { orderHint?: number; matchCount?: number }>;
  visionSongs: Array<ReelSong & { orderHint?: number }>;
  metadataSong: ReelSong | null;
  textSongs: ReelSong[];
}): ReelSong[] {
  const ranked = new Map<string, RankedSong>();

  const upsert = (
    song: ReelSong,
    source: 'audio' | 'vision' | 'metadata' | 'text',
    scoreDelta: number,
    orderHint: number,
  ) => {
    const key = normalizeSongKey(song);
    const existing = ranked.get(key);
    if (!existing) {
      ranked.set(key, {
        ...song,
        score: scoreDelta,
        orderHint,
        sources: new Set([source]),
        audioHits: source === 'audio' ? 1 : 0,
        visionHits: source === 'vision' ? 1 : 0,
        metadataHits: source === 'metadata' ? 1 : 0,
        textHits: source === 'text' ? 1 : 0,
      });
      return;
    }

    existing.score += scoreDelta;
    existing.orderHint = Math.min(existing.orderHint, orderHint);
    existing.sources.add(source);
    if (source === 'audio') existing.audioHits += 1;
    if (source === 'vision') existing.visionHits += 1;
    if (source === 'metadata') existing.metadataHits += 1;
    if (source === 'text') existing.textHits += 1;

    if (displayPreference(song) > displayPreference(existing)) {
      existing.title = song.title;
      existing.artist = song.artist;
    }
    if (!existing.coverUrl && song.coverUrl) existing.coverUrl = song.coverUrl;
  };

  params.audioSongs.forEach((song, index) => {
    const hits = Math.max(1, song.matchCount ?? 1);
    const baseScore = 4 + (hits - 1) * 0.6;
    upsert(song, 'audio', baseScore, song.orderHint ?? index * 12);
  });
  params.visionSongs.forEach((song, index) => upsert(song, 'vision', 4.5, song.orderHint ?? index * 10));
  if (params.metadataSong) upsert(params.metadataSong, 'metadata', 1, Number.MAX_SAFE_INTEGER / 4);
  params.textSongs.forEach((song, index) => upsert(song, 'text', 1.5, Number.MAX_SAFE_INTEGER / 4 + index));

  const candidates = [...ranked.values()]
    .filter((song) => {
      const corroborated = song.sources.has('audio') && song.sources.has('vision');
      const suspiciousStandalone = isSuspiciousStandaloneTitle(song.title)
        && !corroborated
        && !song.sources.has('vision');

      if (suspiciousStandalone) return false;
      if (corroborated) return true;
      if (song.audioHits > 0 && song.score >= 4) return true;
      if (song.visionHits >= 2) return true;
      if (song.visionHits === 1 && song.score >= 4.5) return true;
      return song.score >= 5.5;
    })
    .sort((a, b) => {
      if (a.orderHint !== b.orderHint) return a.orderHint - b.orderHint;
      const corroborationA = (a.sources.has('audio') ? 1 : 0) + (a.sources.has('vision') ? 1 : 0);
      const corroborationB = (b.sources.has('audio') ? 1 : 0) + (b.sources.has('vision') ? 1 : 0);
      if (corroborationA !== corroborationB) return corroborationB - corroborationA;
      return b.score - a.score;
    })
    .map(({ score: _score, orderHint: _orderHint, sources: _sources, ...song }) => song);

  return deduplicateSongs(candidates);
}

async function fileUriToBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) throw new Error('frame_read_failed');
  return base64;
}

function buildFrameOffsetsMs(
  videoDurationSeconds: number | null | undefined,
  range: { startRatio: number; endRatio: number } = { startRatio: 0, endRatio: 1 },
  options?: { maxStepSeconds?: number; minSamples?: number; maxSamples?: number },
): number[] {
  const safeDuration = videoDurationSeconds && videoDurationSeconds > 0
    ? videoDurationSeconds
    : 18;
  const minSeconds = Math.max(0.2, safeDuration * Math.max(0, Math.min(1, range.startRatio)));
  const maxSeconds = Math.max(minSeconds + 0.5, (safeDuration - 0.5) * Math.max(0, Math.min(1, range.endRatio)));
  const spanSeconds = Math.max(0.5, maxSeconds - minSeconds);
  const sampleCount = Math.min(
    options?.maxSamples ?? 14,
    Math.max(
      options?.minSamples ?? 4,
      Math.ceil(spanSeconds / Math.max(1, options?.maxStepSeconds ?? 3)),
    ),
  );
  const offsets = new Set<number>();

  for (let i = 0; i < sampleCount; i += 1) {
    const ratio = (i + 1) / (sampleCount + 1);
    const second = minSeconds + (maxSeconds - minSeconds) * ratio;
    offsets.add(Math.round(second * 1000));
  }

  offsets.add(Math.max(500, Math.round(Math.max(minSeconds, safeDuration - 0.5) * 1000)));
  offsets.add(Math.max(500, Math.round(Math.max(minSeconds, safeDuration - 1.0) * 1000)));

  return [...offsets].sort((a, b) => a - b);
}

async function extractVideoFrames(
  videoUrl: string,
  videoDuration?: number | null,
  range?: { startRatio: number; endRatio: number },
  options?: { maxStepSeconds?: number; minSamples?: number; maxSamples?: number },
): Promise<string[]> {
  const offsets = buildFrameOffsetsMs(videoDuration, range, options);
  const framePayloads = await Promise.all(
    offsets.map(async (time) => {
      const retryOffsets = [0, -120, -300, -600];

      for (const retryOffset of retryOffsets) {
        const targetTime = Math.max(100, time + retryOffset);
        try {
          const { uri } = await VideoThumbnails.getThumbnailAsync(videoUrl, {
            time: targetTime,
            quality: 0.8,
          });
          return await fileUriToBase64(uri);
        } catch (err) {
          if (retryOffset === retryOffsets[retryOffsets.length - 1]) {
            console.warn(`[ReelImportModal] frame extraction failed at ${time}ms`, err);
          }
        }
      }

      return null;
    }),
  );

  return framePayloads.filter((frame): frame is string => !!frame);
}

async function openResolvedTrack(
  userId: string,
  service: MusicService,
  song: ReelSong,
): Promise<boolean> {
  let deepLinks: string[] = [];

  if (service === 'spotify') {
    const trackId = await withTimeout(Spotify.searchTrack(userId, song.title, song.artist), 10_000);
    if (trackId) deepLinks = Spotify.getSpotifyDeepLink(trackId);
  } else if (service === 'apple_music') {
    deepLinks = await withTimeout(
      AppleMusic.resolveAppleMusicTrackLinks(userId, song.title, song.artist),
      10_000,
    );
  } else if (service === 'youtube_music') {
    const trackId = await withTimeout(YouTubeMusic.searchTrack(userId, song.title, song.artist), 10_000);
    if (trackId) deepLinks = YouTubeMusic.getYouTubeMusicDeepLink(trackId);
  }

  for (const link of deepLinks) {
    try {
      await Linking.openURL(link);
      return true;
    } catch {
      // Try the next fallback URL.
    }
  }

  return false;
}

function chunkFrames<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function collectVisionSongs(params: {
  reelUrl: string;
  frameBatches: string[][];
  logLabel: string;
  baseOrderHint: number;
  stopAfterEmptyBatches?: number;
}): Promise<Array<ReelSong & { orderHint: number }>> {
  const visionSongs: Array<ReelSong & { orderHint: number }> = [];
  let consecutiveEmptyBatches = 0;

  for (let i = 0; i < params.frameBatches.length; i += 1) {
    const visionResp = await supabase.functions.invoke('parse-reel', {
      body: {
        url: params.reelUrl,
        frames: params.frameBatches[i],
        vision_only: true,
      },
    });

    if (visionResp.error) throw visionResp.error;
    const visionParsed = (
      typeof visionResp.data === 'string' ? JSON.parse(visionResp.data) : visionResp.data
    ) as ParseReelResponse;

    if (Array.isArray(visionParsed.debug) && visionParsed.debug.length > 0) {
      console.log(
        `[parse-reel vision debug ${params.logLabel} batch ${i + 1}/${params.frameBatches.length}]\n${visionParsed.debug.join('\n')}`,
      );
    }

    const beforeCount = deduplicateSongs(visionSongs).length;
    const batchSongs = (Array.isArray(visionParsed.songs) ? visionParsed.songs : []).map((song) => ({
      ...song,
      orderHint: params.baseOrderHint + i * 10,
    }));
    visionSongs.push(...batchSongs);
    const afterCount = deduplicateSongs(visionSongs).length;

    consecutiveEmptyBatches = afterCount === beforeCount ? consecutiveEmptyBatches + 1 : 0;
    if (consecutiveEmptyBatches >= (params.stopAfterEmptyBatches ?? 2)) break;
  }

  return visionSongs;
}

export function ReelImportModal({ reelUrl, onClose }: ReelImportModalProps) {
  const { user } = useAuth();
  const { following: friends } = useFollows();

  const [stage, setStage] = useState<Stage>('analyzing');
  const [songs, setSongs] = useState<ReelSong[]>([]);
  const [selectedSong, setSelectedSong] = useState<ReelSong | null>(null);
  const [message, setMessage] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [savedList, setSavedList] = useState(false);
  const didAnalyze = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!reelUrl || didAnalyze.current) return;
    didAnalyze.current = true;
    analyze();
  }, [reelUrl]);

  useEffect(() => {
    if (!reelUrl) {
      setStage('analyzing');
      setSongs([]);
      setSelectedSong(null);
      setMessage('');
      setSavingList(false);
      setSavedList(false);
      didAnalyze.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    }
  }, [reelUrl]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const analyze = async () => {
    setStage('analyzing');
    try {
      const { data, error } = await supabase.functions.invoke('parse-reel', {
        body: { url: reelUrl },
      });

      if (error) throw error;
      if (!data) throw new Error('no response');
      const parsed = (typeof data === 'string' ? JSON.parse(data) : data) as ParseReelResponse;

      if (Array.isArray(parsed.debug) && parsed.debug.length > 0) {
        console.log('[parse-reel debug]\n' + parsed.debug.join('\n'));
      }

      const audioSongs = Array.isArray(parsed.audioSongs) ? parsed.audioSongs : [];
      const textSongs = Array.isArray(parsed.textSongs) ? parsed.textSongs : [];
      let mergedSongs = rankSongs({
        audioSongs,
        visionSongs: [],
        metadataSong: parsed.metadataSong ?? null,
        textSongs,
      });

      if (parsed.videoUrl) {
        const shouldRunVision = mergedSongs.length < 5;
        if (!shouldRunVision) {
          setSongs(mergedSongs);
          setStage('songList');
          return;
        }

        let visionSongs: Array<ReelSong & { orderHint: number }> = [];
        const shortDenseReel = (parsed.videoDuration ?? 0) > 0
          && (parsed.videoDuration ?? 0) <= 30
          && mergedSongs.length <= 3;

        if (shortDenseReel) {
          const fullFrames = await extractVideoFrames(parsed.videoUrl, parsed.videoDuration, {
            startRatio: 0,
            endRatio: 1,
          }, {
            maxStepSeconds: 1.0,
            minSamples: 12,
            maxSamples: 24,
          });

          if (fullFrames.length > 0) {
            visionSongs = await collectVisionSongs({
              reelUrl: reelUrl!,
              frameBatches: chunkFrames(fullFrames, 2).filter((batch) => batch.length > 0),
              logLabel: 'full',
              baseOrderHint: 0,
              stopAfterEmptyBatches: 3,
            });
          }

          mergedSongs = rankSongs({
            audioSongs,
            visionSongs,
            metadataSong: parsed.metadataSong ?? null,
            textSongs,
          });
        } else {
          const lateFrames = await extractVideoFrames(parsed.videoUrl, parsed.videoDuration, {
            startRatio: 0.4,
            endRatio: 1,
          }, {
            maxStepSeconds: 1.6,
            minSamples: 8,
            maxSamples: 18,
          });

          if (lateFrames.length > 0) {
            visionSongs = await collectVisionSongs({
              reelUrl: reelUrl!,
              frameBatches: chunkFrames(lateFrames, 3).filter((batch) => batch.length > 0),
              logLabel: 'late',
              baseOrderHint: 60,
            });
            mergedSongs = rankSongs({
              audioSongs,
              visionSongs,
              metadataSong: parsed.metadataSong ?? null,
              textSongs,
            });
          }
        }

          if (mergedSongs.length < 8) {
            const middleFrames = await extractVideoFrames(parsed.videoUrl, parsed.videoDuration, {
              startRatio: 0.18,
              endRatio: 0.62,
            }, {
              maxStepSeconds: 1.35,
              minSamples: 6,
              maxSamples: 12,
            });

            if (middleFrames.length > 0) {
              const middleVisionSongs = await collectVisionSongs({
                reelUrl: reelUrl!,
                frameBatches: chunkFrames(middleFrames, 2).filter((batch) => batch.length > 0),
                logLabel: 'middle',
                baseOrderHint: 25,
              });
              visionSongs = [...visionSongs, ...middleVisionSongs];
              mergedSongs = rankSongs({
                audioSongs,
                visionSongs,
                metadataSong: parsed.metadataSong ?? null,
                textSongs,
              });
            }
          }

          if (mergedSongs.length < 10) {
            const earlyFrames = await extractVideoFrames(parsed.videoUrl, parsed.videoDuration, {
              startRatio: 0,
              endRatio: 0.22,
            }, {
              maxStepSeconds: 1.5,
              minSamples: 5,
              maxSamples: 10,
            });

            if (earlyFrames.length > 0) {
              const earlyVisionSongs = await collectVisionSongs({
                reelUrl: reelUrl!,
                frameBatches: chunkFrames(earlyFrames, 2).filter((batch) => batch.length > 0),
                logLabel: 'early',
                baseOrderHint: 0,
              });
              visionSongs = [...visionSongs, ...earlyVisionSongs];
              mergedSongs = rankSongs({
                audioSongs,
                visionSongs,
                metadataSong: parsed.metadataSong ?? null,
                textSongs,
              });
            }
          }
      } else {
        mergedSongs = rankSongs({
          audioSongs,
          visionSongs: [],
          metadataSong: parsed.metadataSong ?? null,
          textSongs,
        });
      }

      if (mergedSongs.length > 0) {
        setSongs(mergedSongs);
        setStage('songList');
      } else {
        console.warn('[ReelImportModal] all stages missed');
        setStage('failed');
        closeTimer.current = setTimeout(onClose, 2500);
      }
    } catch (err) {
      const context = (err as { context?: Response }).context;
      if (context) {
        try {
          const bodyText = await context.text();
          console.error('[ReelImportModal] analyze error body:', bodyText);
        } catch {
          // Ignore body read failures; the main error log below is still useful.
        }
      }
      console.error('[ReelImportModal] analyze error:', err);
      setStage('failed');
      closeTimer.current = setTimeout(onClose, 2500);
    }
  };

  const handleOpenSong = async (song: ReelSong) => {
    if (!user?.primary_service) {
      Alert.alert('No service', 'Set a primary streaming service in your profile.');
      return;
    }

    try {
      const opened = await openResolvedTrack(user.id, user.primary_service as MusicService, song);
      if (opened) return;

      const query = encodeURIComponent(`${song.title} ${song.artist}`);
      await Linking.openURL(`https://song.link/search?query=${query}`);
    } catch (err: any) {
      const msg =
        err?.message === 'timeout'
          ? 'Request timed out. Check your connection.'
          : err?.message === 'youtube_quota_exceeded'
            ? 'YouTube search quota reached for today. Try again tomorrow.'
            : err?.message?.startsWith('youtube_music_topic_not_found')
              ? 'This song isn\'t available as a YouTube Music Song yet. It may only exist as a video.'
              : 'Could not open this song right now.';
      console.error('[ReelImportModal] open song error:', err);
      Alert.alert('Error', msg);
    }
  };

  const handleSelectSong = (song: ReelSong) => {
    setSelectedSong(song);
    setStage('pickFriend');
  };

  const handleSaveReelList = async () => {
    if (!user || !reelUrl || songs.length === 0 || savingList) return;

    setSavingList(true);
    try {
      await saveReelList(user.id, reelUrl, songs);
      setSavedList(true);
      Alert.alert('Saved', 'This reel song list was saved to your Library.');
    } catch (err) {
      console.error('[ReelImportModal] save reel list error:', err);
      Alert.alert('Error', 'Could not save this reel list. Please try again.');
    } finally {
      setSavingList(false);
    }
  };

  const handleBack = () => {
    setSelectedSong(null);
    setMessage('');
    setStage('songList');
  };

  const handleShareToFriend = async (friend: User) => {
    if (!user || !selectedSong) return;
    setStage('sharing');

    try {
      const { error } = await supabase.from('shared_items').insert({
        sender_id: user.id,
        recipient_id: friend.id,
        type: 'song',
        title: selectedSong.title,
        artist: selectedSong.artist,
        cover_image_url: selectedSong.coverUrl || null,
        message: message.trim() || null,
      });
      if (error) throw error;

      sendPushNotification(
        friend.id,
        `${user.display_name ?? user.username} shared a song`,
        selectedSong.title,
        { type: 'new_share' },
      );

      Alert.alert('Sent!', `Shared "${selectedSong.title}" with ${friend.display_name}.`);
      onClose();
    } catch (err) {
      console.error('[ReelImportModal] share error:', err);
      Alert.alert('Error', 'Failed to share. Please try again.');
      setStage('pickFriend');
    }
  };

  if (!reelUrl) return null;

  return (
    <Modal
      visible={!!reelUrl}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          {stage === 'pickFriend' || stage === 'sharing' ? (
            <TouchableOpacity onPress={handleBack} style={styles.backButton} disabled={stage === 'sharing'}>
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <Ionicons name="logo-instagram" size={20} color="#fff" />
          )}
          <Text style={styles.headerTitle}>
            {stage === 'pickFriend' || stage === 'sharing' ? 'Share with' : 'Import from Reel'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Analyzing */}
        {stage === 'analyzing' && (
          <View style={styles.centeredContent}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.analyzingText}>Identifying songs…</Text>
            <Text style={styles.analyzingHint}>Scanning audio, captions, and video frames</Text>
          </View>
        )}

        {/* Failed */}
        {stage === 'failed' && (
          <View style={styles.centeredContent}>
            <Ionicons name="musical-notes-outline" size={48} color="#555" />
            <Text style={styles.failedText}>Couldn't identify any songs in this reel</Text>
          </View>
        )}

        {/* Song list */}
        {stage === 'songList' && (
          <>
            <View style={styles.songListHeader}>
              <Text style={styles.sectionLabel}>{songs.length} song{songs.length !== 1 ? 's' : ''} found</Text>
              <TouchableOpacity
                style={[styles.saveListButton, savedList && styles.saveListButtonSaved]}
                onPress={handleSaveReelList}
                disabled={savingList || savedList}
                activeOpacity={0.8}
                accessibilityLabel="Save reel song list"
              >
                {savingList ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons
                    name={savedList ? 'bookmark' : 'bookmark-outline'}
                    size={18}
                    color={savedList ? '#fff' : '#888'}
                  />
                )}
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              {songs.map((song, i) => (
                <TouchableOpacity
                  key={`${song.title}-${song.artist}-${i}`}
                  style={styles.songRow}
                  onPress={() => handleOpenSong(song)}
                  activeOpacity={0.75}
                >
                  {song.coverUrl ? (
                    <Image source={{ uri: song.coverUrl }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, styles.coverPlaceholder]}>
                      <Ionicons name="musical-note" size={22} color="#555" />
                    </View>
                  )}
                  <View style={styles.songInfo}>
                    <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                    <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleSelectSong(song)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.shareIcon}
                  >
                    <Ionicons name="paper-plane-outline" size={18} color="#555" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* Friend picker */}
        {(stage === 'pickFriend' || stage === 'sharing') && selectedSong && (
          <>
            {/* Selected song mini-card */}
            <View style={styles.selectedSongCard}>
              {selectedSong.coverUrl ? (
                <Image source={{ uri: selectedSong.coverUrl }} style={styles.miniCover} />
              ) : (
                <View style={[styles.miniCover, styles.coverPlaceholder]}>
                  <Ionicons name="musical-note" size={16} color="#555" />
                </View>
              )}
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>{selectedSong.title}</Text>
                <Text style={styles.songArtist} numberOfLines={1}>{selectedSong.artist}</Text>
              </View>
            </View>

            <View style={styles.messageRow}>
              <TextInput
                style={styles.messageInput}
                placeholder="Add a message (optional)"
                placeholderTextColor="#555"
                value={message}
                onChangeText={setMessage}
                maxLength={200}
              />
            </View>

            <ScrollView style={styles.friendList} contentContainerStyle={{ paddingBottom: 20 }}>
              {friends.length === 0 ? (
                <Text style={styles.emptyFriends}>
                  Follow someone to share songs with them.
                </Text>
              ) : (
                friends.map((friend) => {
                  const initials = (friend.display_name?.[0] ?? friend.username?.[0] ?? '?').toUpperCase();
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      style={[styles.friendRow, stage === 'sharing' && styles.friendRowDisabled]}
                      onPress={() => handleShareToFriend(friend)}
                      disabled={stage === 'sharing'}
                      activeOpacity={0.8}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>
                      <View style={styles.friendInfo}>
                        <Text style={styles.friendName}>{friend.display_name}</Text>
                        <Text style={styles.friendUsername}>@{friend.username}</Text>
                      </View>
                      {stage === 'sharing' ? (
                        <ActivityIndicator size="small" color="#555" />
                      ) : (
                        <Ionicons name="paper-plane-outline" size={18} color="#555" />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  backButton: {
    padding: 2,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    color: '#666',
    fontSize: 18,
  },
  centeredContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },
  analyzingText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  analyzingHint: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
  },
  failedText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  sectionLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  songListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 6,
  },
  saveListButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  saveListButtonSaved: {
    backgroundColor: '#fc3c44',
    borderColor: '#fc3c44',
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  selectedSongCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingHorizontal: 20,
    gap: 14,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  miniCover: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  coverPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  songInfo: {
    flex: 1,
  },
  songTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  songArtist: {
    color: '#888',
    fontSize: 13,
  },
  messageRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
    marginBottom: 8,
  },
  messageInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  friendList: {
    flex: 1,
  },
  emptyFriends: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  friendRowDisabled: {
    opacity: 0.5,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#888',
    fontSize: 16,
    fontWeight: '700',
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  friendUsername: {
    color: '#666',
    fontSize: 13,
  },
  shareIcon: {
    padding: 4,
  },
});
