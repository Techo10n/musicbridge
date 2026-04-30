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
import { colors } from '../lib/theme';

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

async function getCurrentAccessToken(retries = 3): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (accessToken) return accessToken;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw new Error('auth_session_unavailable');
}

async function invokeParseReel(body: {
  url?: string;
  frames?: string[];
  vision_only?: boolean;
}): Promise<ParseReelResponse> {
  const accessToken = await getCurrentAccessToken();
  const visionResp = await supabase.functions.invoke('parse-reel', {
    body,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (visionResp.error) throw visionResp.error;
  if (typeof visionResp.data === 'string') {
    try {
      return JSON.parse(visionResp.data) as ParseReelResponse;
    } catch (err) {
      console.error('[ReelImportModal] failed to parse ParseReelResponse:', visionResp.data, err);
      throw new Error(`parse_reel_response_json_failed: ${visionResp.data}`);
    }
  }
  return visionResp.data as ParseReelResponse;
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
    deepLinks = (await withTimeout(
      AppleMusic.resolveAppleMusicTrackLinks(userId, song.title, song.artist),
      10_000,
    )) ?? [];
  } else if (service === 'youtube_music') {
    try {
      const trackId = await withTimeout(YouTubeMusic.searchTrack(userId, song.title, song.artist), 10_000);
      if (trackId) deepLinks = YouTubeMusic.getYouTubeMusicDeepLink(trackId);
    } catch (err) {
      if ((err as Error)?.message?.startsWith('youtube_music_topic_not_found')) {
        return false;
      }
      throw err;
    }
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
    const visionParsed = await invokeParseReel({
      url: params.reelUrl,
      frames: params.frameBatches[i],
      vision_only: true,
    });

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

// Pipeline step type for the analyzing visualization
type PipelineStepState = 'pending' | 'active' | 'done' | 'failed';
interface PipelineStep { label: string; detail: string; state: PipelineStepState }

export function ReelImportModal({ reelUrl, onClose }: ReelImportModalProps) {
  const { session, user, loading: authLoading } = useAuth();
  const { following: friends } = useFollows();

  const [stage, setStage] = useState<Stage>('analyzing');
  const [songs, setSongs] = useState<ReelSong[]>([]);
  const [selectedSong, setSelectedSong] = useState<ReelSong | null>(null);
  const [message, setMessage] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [savedList, setSavedList] = useState(false);
  const didAnalyze = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pipeline visualization state
  const [pipeline, setPipeline] = useState<PipelineStep[]>([
    { label: 'Reel metadata', detail: 'Checking audio attribution', state: 'active' },
    { label: 'Audio fingerprint', detail: '', state: 'pending' },
    { label: 'Frame OCR (vision)', detail: '', state: 'pending' },
    { label: 'Confidence merge', detail: '', state: 'pending' },
  ]);
  const [bestMatch, setBestMatch] = useState<ReelSong | null>(null);

  const updateStep = (idx: number, state: PipelineStepState, detail?: string) => {
    setPipeline(prev => prev.map((s, i) => i === idx ? { ...s, state, detail: detail ?? s.detail } : s));
  };

  useEffect(() => {
    if (!reelUrl || didAnalyze.current || !session || !user || authLoading) return;
    didAnalyze.current = true;
    analyze();
  }, [authLoading, reelUrl, session, user]);

  useEffect(() => {
    if (!reelUrl) {
      setStage('analyzing');
      setSongs([]);
      setSelectedSong(null);
      setMessage('');
      setSavingList(false);
      setSavedList(false);
      setBestMatch(null);
      setPipeline([
        { label: 'Reel metadata', detail: 'Checking audio attribution', state: 'active' },
        { label: 'Audio fingerprint', detail: '', state: 'pending' },
        { label: 'Frame OCR (vision)', detail: '', state: 'pending' },
        { label: 'Confidence merge', detail: '', state: 'pending' },
      ]);
      didAnalyze.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    }
  }, [reelUrl]);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const analyze = async () => {
    setStage('analyzing');
    try {
      // Step 0: metadata
      updateStep(0, 'active', 'Checking reel metadata…');
      const parsed = await invokeParseReel({ url: reelUrl ?? undefined });

      if (Array.isArray(parsed.debug) && parsed.debug.length > 0) {
        console.log('[parse-reel debug]\n' + parsed.debug.join('\n'));
      }

      const audioSongs = Array.isArray(parsed.audioSongs) ? parsed.audioSongs : [];
      const textSongs = Array.isArray(parsed.textSongs) ? parsed.textSongs : [];

      // Step 0 done
      updateStep(0, 'done', parsed.metadataSong ? '1 song attributed' : 'No song attribution');

      // Step 1: audio
      updateStep(1, 'active', `${audioSongs.length} candidate${audioSongs.length !== 1 ? 's' : ''} from audio`);

      let mergedSongs = rankSongs({
        audioSongs,
        visionSongs: [],
        metadataSong: parsed.metadataSong ?? null,
        textSongs,
      });
      updateStep(1, 'done', `${audioSongs.length} audio match${audioSongs.length !== 1 ? 'es' : ''}`);

      if (mergedSongs.length > 0) setBestMatch(mergedSongs[0]);

      let visionSongs: Array<ReelSong & { orderHint: number }> = [];

      if (parsed.videoUrl) {
        const shouldRunVision = mergedSongs.length < 5;
        if (!shouldRunVision) {
          updateStep(2, 'done', 'Skipped — enough audio matches');
          updateStep(3, 'active', 'Merging results…');
          updateStep(3, 'done', `${mergedSongs.length} songs found`);
          setSongs(mergedSongs);
          setStage('songList');
          return;
        }

        // Step 2: vision
        updateStep(2, 'active', 'Reading video frames…');
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

      // Step 2 done, step 3 merge
      updateStep(2, 'done', `${visionSongs.length} visual match${visionSongs.length !== 1 ? 'es' : ''}`);
      updateStep(3, 'active', 'Merging all sources…');

      if (mergedSongs.length > 0) {
        setBestMatch(mergedSongs[0]);
        updateStep(3, 'done', `${mergedSongs.length} song${mergedSongs.length !== 1 ? 's' : ''} found`);
        setSongs(mergedSongs);
        setStage('songList');
      } else {
        updateStep(3, 'failed', 'No confident matches');
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
      if ((err as Error)?.message === 'auth_session_unavailable') {
        Alert.alert('Connection error', 'Your session is still loading. Try opening the reel again in a moment.');
      }
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
      const { data: insertedItem, error } = await supabase.from('shared_items').insert({
        sender_id: user.id,
        recipient_id: friend.id,
        type: 'song',
        title: selectedSong.title,
        artist: selectedSong.artist,
        cover_image_url: selectedSong.coverUrl || null,
        message: message.trim() || null,
      }).select('id').single();
      if (error) throw error;

      sendPushNotification(friend.id, 'new_share', insertedItem.id);

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
    <Modal visible={!!reelUrl} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          {(stage === 'pickFriend' || stage === 'sharing') ? (
            <TouchableOpacity onPress={handleBack} disabled={stage === 'sharing'} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={22} color={colors.fg2} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerIcon}>
              <Ionicons name="radio-outline" size={18} color={colors.primaryInk} />
            </View>
          )}
          <Text style={styles.headerTitle}>
            {stage === 'pickFriend' || stage === 'sharing' ? 'Share with' : 'Identify from Reel'}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.fg3} />
          </TouchableOpacity>
        </View>

        {/* ── Analyzing: pipeline visualization ── */}
        {stage === 'analyzing' && (
          <View style={styles.pipelineContainer}>
            <Text style={styles.pipelineTitle}>Identifying songs…</Text>
            <Text style={styles.pipelineSub}>Scanning audio, captions, and video frames</Text>

            <View style={styles.pipelineSteps}>
              {pipeline.map((step, i) => (
                <View key={i} style={styles.pipelineStep}>
                  <PipelineDot state={step.state} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.pipelineStepLabel, step.state === 'active' && styles.pipelineStepLabelActive]}>
                      {step.label}
                    </Text>
                    {step.detail ? <Text style={styles.pipelineStepDetail}>{step.detail}</Text> : null}
                  </View>
                </View>
              ))}
            </View>

            {/* Best match preview (updates live) */}
            {bestMatch && (
              <TouchableOpacity
                style={styles.bestMatchCard}
                onPress={() => handleOpenSong(bestMatch)}
                activeOpacity={0.8}
              >
                <Text style={styles.bestMatchLabel}>Best match so far</Text>
                <View style={styles.bestMatchRow}>
                  <CoverArtSmall uri={bestMatch.coverUrl} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.bestMatchTitle} numberOfLines={1}>{bestMatch.title}</Text>
                    <Text style={styles.bestMatchArtist} numberOfLines={1}>{bestMatch.artist}</Text>
                  </View>
                  <Ionicons name="open-outline" size={18} color={colors.fg3} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── Failed ── */}
        {stage === 'failed' && (
          <View style={styles.centeredContent}>
            <Ionicons name="musical-notes-outline" size={52} color={colors.fg4} />
            <Text style={styles.failedTitle}>No songs found</Text>
            <Text style={styles.failedSub}>Couldn't identify any songs in this reel</Text>
          </View>
        )}

        {/* ── Song list ── */}
        {stage === 'songList' && (
          <>
            <View style={styles.songListHeader}>
              <Text style={styles.songListCount}>{songs.length} song{songs.length !== 1 ? 's' : ''} found</Text>
              <TouchableOpacity
                style={[styles.saveBtn, savedList && styles.saveBtnActive]}
                onPress={handleSaveReelList}
                disabled={savingList || savedList}
                activeOpacity={0.8}
              >
                {savingList
                  ? <ActivityIndicator size="small" color={savedList ? colors.primaryInk : colors.fg3} />
                  : <Ionicons name={savedList ? 'bookmark' : 'bookmark-outline'} size={18} color={savedList ? colors.primaryInk : colors.fg3} />
                }
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
              {songs.map((song, i) => (
                <TouchableOpacity
                  key={`${song.title}-${song.artist}-${i}`}
                  style={styles.songRow}
                  onPress={() => handleOpenSong(song)}
                  activeOpacity={0.75}
                >
                  <CoverArtSmall uri={song.coverUrl} large />
                  <View style={styles.songInfo}>
                    <Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
                    <Text style={styles.songArtist} numberOfLines={1}>{song.artist}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleSelectSong(song)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="paper-plane-outline" size={20} color={colors.primary} />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Friend picker ── */}
        {(stage === 'pickFriend' || stage === 'sharing') && selectedSong && (
          <>
            <View style={styles.selectedCard}>
              <CoverArtSmall uri={selectedSong.coverUrl} />
              <View style={styles.songInfo}>
                <Text style={styles.songTitle} numberOfLines={1}>{selectedSong.title}</Text>
                <Text style={styles.songArtist} numberOfLines={1}>{selectedSong.artist}</Text>
              </View>
            </View>

            <View style={styles.messageRow}>
              <TextInput
                style={styles.messageInput}
                placeholder="Add a message (optional)"
                placeholderTextColor={colors.fg4}
                value={message}
                onChangeText={setMessage}
                maxLength={200}
              />
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
              {friends.length === 0 ? (
                <Text style={styles.emptyFriends}>Follow someone to share songs with them.</Text>
              ) : (
                friends.map((friend) => {
                  const initials = (friend.display_name?.[0] ?? friend.username?.[0] ?? '?').toUpperCase();
                  return (
                    <TouchableOpacity
                      key={friend.id}
                      style={[styles.friendRow, stage === 'sharing' && { opacity: 0.5 }]}
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
                      {stage === 'sharing'
                        ? <ActivityIndicator size="small" color={colors.fg3} />
                        : <Ionicons name="paper-plane-outline" size={18} color={colors.primary} />
                      }
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

// ─── Pipeline dot ─────────────────────────────────────────────────────────────
function PipelineDot({ state }: { state: PipelineStepState }) {
  if (state === 'done') {
    return (
      <View style={pipelineDotStyles.done}>
        <Ionicons name="checkmark-sharp" size={12} color={colors.primaryInk} />
      </View>
    );
  }
  if (state === 'active') {
    return <View style={pipelineDotStyles.active} />;
  }
  if (state === 'failed') {
    return (
      <View style={pipelineDotStyles.failed}>
        <Ionicons name="close" size={12} color="#fff" />
      </View>
    );
  }
  return <View style={pipelineDotStyles.pending} />;
}

const pipelineDotStyles = StyleSheet.create({
  done: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  active: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.5, borderColor: colors.primary, flexShrink: 0 },
  failed: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.coral, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  pending: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line, flexShrink: 0 },
});

function CoverArtSmall({ uri, large }: { uri?: string | null; large?: boolean }) {
  const size = large ? 52 : 40;
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.bgCard }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: 8, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="musical-note" size={size * 0.4} color={colors.fg4} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, color: colors.fg, fontSize: 18, fontWeight: '700' },

  // Pipeline
  pipelineContainer: { flex: 1, padding: 24, gap: 20 },
  pipelineTitle: { fontSize: 20, fontWeight: '700', color: colors.fg },
  pipelineSub: { fontSize: 13, color: colors.fg3, marginTop: -14 },
  pipelineSteps: {
    backgroundColor: colors.bgCard, borderRadius: 16,
    borderWidth: 1, borderColor: colors.line,
    padding: 16, gap: 14,
  },
  pipelineStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pipelineStepLabel: { fontSize: 14, fontWeight: '500', color: colors.fg2 },
  pipelineStepLabelActive: { fontWeight: '700', color: colors.fg },
  pipelineStepDetail: { fontSize: 12, color: colors.fg3, marginTop: 2 },

  bestMatchCard: {
    backgroundColor: colors.bgCard, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, padding: 14, gap: 10,
  },
  bestMatchLabel: { fontSize: 11, fontWeight: '600', color: colors.fg3, textTransform: 'uppercase', letterSpacing: 0.5 },
  bestMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bestMatchTitle: { fontSize: 15, fontWeight: '700', color: colors.fg, marginBottom: 2 },
  bestMatchArtist: { fontSize: 12, color: colors.fg3 },

  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 },
  failedTitle: { fontSize: 18, fontWeight: '700', color: colors.fg },
  failedSub: { fontSize: 14, color: colors.fg3, textAlign: 'center' },

  // Song list
  songListHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  songListCount: { fontSize: 12, fontWeight: '600', color: colors.fg3, textTransform: 'uppercase', letterSpacing: 0.8 },
  saveBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line },
  saveBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },

  songRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 13, gap: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  selectedCard: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingHorizontal: 20, gap: 14, backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.line },
  songInfo: { flex: 1 },
  songTitle: { color: colors.fg, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  songArtist: { color: colors.fg3, fontSize: 13 },

  messageRow: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8 },
  messageInput: { backgroundColor: colors.bgCard, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, color: colors.fg, fontSize: 14, borderWidth: 1, borderColor: colors.line },

  emptyFriends: { color: colors.fg3, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 32, lineHeight: 20 },
  friendRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.fg3, fontSize: 16, fontWeight: '700' },
  friendInfo: { flex: 1 },
  friendName: { color: colors.fg, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  friendUsername: { color: colors.fg3, fontSize: 13 },
});
