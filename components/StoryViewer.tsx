import { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Linking, Modal, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { Story } from '../hooks/useStories';
import { CoverArt, Avatar, serviceLabelShort } from './ui';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { useAuth } from '../hooks/useAuth';

interface StoryViewerProps {
  stories: Story[];          // all stories for this user (segments)
  initialIndex?: number;
  visible: boolean;
  onClose: () => void;
  onReact: (storyId: string, emoji: string) => void;
}

const SEGMENT_DURATION = 6000; // ms per segment auto-advance
const REACTIONS = ['🔥', '❤️', '🤯', '😮', '💫'];

export function StoryViewer({ stories, initialIndex = 0, visible, onClose, onReact }: StoryViewerProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [segIdx, setSegIdx] = useState(initialIndex);
  const [reply, setReply] = useState('');
  const [sentReaction, setSentReaction] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const story = stories[segIdx] ?? stories[0];
  const total = stories.length;

  // Reset on open
  useEffect(() => {
    if (visible && stories.length > 0) {
      setSegIdx(initialIndex);
      setSentReaction(null);
      setReply('');
    }
  }, [visible, initialIndex, stories.length]);

  useEffect(() => {
    return () => {
      if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
    };
  }, []);

  // Progress animation per segment
  useEffect(() => {
    if (!visible || !story) return;
    progressAnim.setValue(0);
    const anim = Animated.timing(progressAnim, {
      toValue: 1,
      duration: SEGMENT_DURATION,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) advance();
    });

    return () => {
      anim.stop();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, segIdx]);

  const advance = () => {
    if (segIdx < total - 1) {
      setSegIdx(i => i + 1);
    } else {
      onClose();
    }
  };

  const goBack = () => {
    if (segIdx > 0) setSegIdx(i => i - 1);
  };

  const handleReact = (emoji: string) => {
    if (!story) return;
    onReact(story.id, emoji);
    setSentReaction(emoji);
    if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
    reactionTimeoutRef.current = setTimeout(() => {
      setSentReaction(null);
      reactionTimeoutRef.current = null;
    }, 1500);
  };

  const handleOpenInService = async () => {
    if (!story || !user) return;
    try {
      let links: string[] = [];
      const svc = story.service;
      if (svc === 'spotify') {
        const id = await Spotify.searchTrack(user.id, story.song_title, story.song_artist);
        if (id) links = Spotify.getSpotifyDeepLink(id);
      } else if (svc === 'apple_music') {
        links = await AppleMusic.resolveAppleMusicTrackLinks(user.id, story.song_title, story.song_artist);
      } else if (svc === 'youtube_music') {
        const id = await YouTubeMusic.searchTrack(user.id, story.song_title, story.song_artist);
        if (id) links = YouTubeMusic.getYouTubeMusicDeepLink(id);
      }
      for (const l of links) {
        try { await Linking.openURL(l); return; }
        catch (err) { console.error('[StoryViewer] openURL failed:', l, err); }
      }
      Alert.alert('Could not open song', 'No supported link opened for this story.');
    } catch (err) {
      console.error('[StoryViewer] service lookup failed:', err);
      Alert.alert('Lookup failed', 'Could not find this song on the selected service.');
    }
  };

  const handleMore = () => {
    Alert.alert('Story options', 'Story reporting and sharing are not currently available.');
  };

  const handleReply = () => {
    const trimmed = reply.trim();
    if (!trimmed) return;
    setReply('');
    Alert.alert('Reply not sent', 'Story replies are not currently available.');
  };

  if (stories.length === 0 || !story) return null;

  const svcLabel = serviceLabelShort(story.service);

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingBottom: insets.bottom }]}>
        {/* Background layers */}
        <View style={styles.bgDark} />
        <View style={[styles.bgAccent, { opacity: 0.35 }]} />

        {/* Tap zones: left=back, right=forward */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none">
          <TouchableOpacity style={styles.tapLeft} onPress={goBack} activeOpacity={1} />
          <TouchableOpacity style={styles.tapRight} onPress={advance} activeOpacity={1} />
        </View>

        {/* Top row: circle progress + avatar + name + actions */}
        <View style={[styles.topRow, { paddingTop: insets.top + 12 }]}>
          {/* Hollow circle progress */}
          <View style={styles.circleProgress}>
            <View style={styles.circleProgressRing} />
            <Text style={styles.circleProgressText}>{segIdx + 1}/{total}</Text>
          </View>

          <Avatar
            name={story.user?.display_name ?? '?'}
            avatarUrl={story.user?.avatar_url}
            size={32}
          />

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.senderName} numberOfLines={1}>
              {story.user?.username ?? 'unknown'}
            </Text>
            <Text style={styles.senderMeta}>
              {timeAgo(story.created_at)} · {svcLabel}
            </Text>
          </View>

          <TouchableOpacity onPress={handleMore} style={styles.moreBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>
        </View>

        {/* Thin segment bar below top row */}
        <View style={styles.segBarRow}>
          {stories.map((_, i) => (
            <View key={i} style={[styles.segBar, i === segIdx && styles.segBarActive, i < segIdx && styles.segBarDone]}>
              {i === segIdx && (
                <Animated.View
                  style={[styles.segBarFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
                />
              )}
            </View>
          ))}
        </View>

        {/* Center content */}
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.listeningTo}>listening to</Text>
          <CoverArt uri={story.song_cover_url} size={240} radius={20} />
          <Text style={styles.songTitle} numberOfLines={2}>{story.song_title}</Text>
          <Text style={styles.songArtist}>{story.song_artist}</Text>

          {story.caption ? (
            <View style={styles.captionBubble}>
              <Text style={styles.captionText}>"{story.caption}"</Text>
            </View>
          ) : null}
        </View>

        {/* Reaction overlay */}
        {sentReaction ? (
          <View style={styles.reactionOverlay} pointerEvents="none">
            <Text style={styles.reactionOverlayEmoji}>{sentReaction}</Text>
          </View>
        ) : null}

        {/* Bottom: Open in service + reply + emojis */}
        <View style={styles.bottom}>
          <TouchableOpacity style={styles.openBtn} onPress={handleOpenInService} activeOpacity={0.9}>
            <Ionicons name="musical-note" size={18} color="#000" />
            <Text style={styles.openBtnText}>Open in {svcLabel}</Text>
            <Ionicons name="arrow-forward" size={16} color="#000" />
          </TouchableOpacity>

          <View style={styles.replyRow}>
            <TextInput
              style={styles.replyInput}
              placeholder="Reply…"
              placeholderTextColor="rgba(255,255,255,0.45)"
              value={reply}
              onChangeText={setReply}
              returnKeyType="send"
              onSubmitEditing={handleReply}
            />
            {REACTIONS.map(e => (
              <TouchableOpacity key={e} style={styles.emojiBtn} onPress={() => handleReact(e)} activeOpacity={0.8}>
                <Text style={styles.emojiText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a10',
  },
  bgDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a10',
  },
  bgAccent: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.primary,
  },
  tapLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%' },
  tapRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '60%' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    zIndex: 10,
  },
  circleProgress: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  circleProgressRing: {
    position: 'absolute',
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  circleProgressText: {
    color: '#fff', fontSize: 10, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  segBarRow: {
    flexDirection: 'row', gap: 4,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    zIndex: 10,
  },
  segBar: {
    flex: 1, height: 2, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  segBarActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  segBarDone: { backgroundColor: 'rgba(255,255,255,0.85)' },
  segBarFill: { height: '100%', backgroundColor: '#fff' },
  senderName: { color: '#fff', fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  senderMeta: { color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 1 },
  moreBtn: { padding: 6 },
  closeBtn: { padding: 6 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  listeningTo: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  songTitle: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginTop: 8,
  },
  songArtist: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
  },
  captionBubble: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    maxWidth: 280,
  },
  captionText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  reactionOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    pointerEvents: 'none',
  },
  reactionOverlayEmoji: { fontSize: 80 },
  bottom: { paddingHorizontal: 16, paddingBottom: 10, gap: 12, zIndex: 10 },
  openBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 999,
    paddingVertical: 14,
  },
  openBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },
  replyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  replyInput: {
    flex: 1, height: 42,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 999,
    paddingHorizontal: 16,
    color: '#fff',
    fontSize: 14,
  },
  emojiBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  emojiText: { fontSize: 18 },
});
