import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../hooks/useAuth';
import { useFollows } from '../hooks/useFollows';
import { useLibrary } from '../hooks/useLibrary';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { serviceLabel } from '../lib/services';
import { EmptyPlaylistError, ShareDraft, sendShare, toTrackPayload } from '../lib/sharing';
import { extractYouTubeTrackInfo } from '../lib/youtubeMusic';
import { cleanTitle } from '../lib/utils';
import { makeStyles, useTheme } from '../lib/theme';
import { LibraryPlaylist, MusicService, User } from '../types';
import {
  Avatar, Button, CoverArt, EmptyState, ListRow, Sheet, Skeleton, Txt, useToast,
} from './ui';

type Source = 'search' | 'recent' | 'playlists';

/** A pickable thing, before it becomes a ShareDraft. */
interface Candidate {
  key: string;
  kind: 'song' | 'playlist';
  title: string;
  subtitle: string;
  coverUrl: string;
  serviceId: string;
  isrc?: string | null;
  ytTopicVerified?: boolean;
  trackCount?: number;
}

export interface ShareComposerProps {
  visible: boolean;
  onClose: () => void;
  /** Skips content selection when the caller already has something to send. */
  draft?: ShareDraft | null;
  /** Preselects a recipient, e.g. when opened from their profile. */
  recipient?: User | null;
  onSent?: () => void;
}

/**
 * Pick something, pick who, send. The only way a share is composed, so the
 * rules about which service ids are trustworthy live in one place
 * (`lib/sharing.ts`) rather than in each screen that can share.
 */
export function ShareComposer({ visible, onClose, draft: initialDraft, recipient, onSent }: ShareComposerProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const { mutualFollows, refresh: refreshFollows } = useFollows();
  const { getPlaylistTracks } = useLibrary();

  const service = (user?.primary_service ?? null) as MusicService | null;

  const [draft, setDraft] = useState<ShareDraft | null>(initialDraft ?? null);
  const [source, setSource] = useState<Source>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Candidate[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(recipient ? [recipient.id] : []));
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  // Reset to the caller's starting point every time the sheet opens.
  //
  // Keyed on `visible` alone, deliberately. Callers pass `draft` and `recipient`
  // as object literals, so depending on their identity would re-run this on
  // every parent render and wipe whatever the user had typed or selected.
  const openState = useRef({ initialDraft, recipient, refreshFollows });

  // Declared before the reset below so it has already run by the time that one
  // reads the ref: effects fire after render, in declaration order.
  useEffect(() => {
    openState.current = { initialDraft, recipient, refreshFollows };
  });

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    const { initialDraft: startDraft, recipient: startRecipient, refreshFollows: refresh } = openState.current;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setDraft(startDraft ?? null);
      setSelected(new Set(startRecipient ? [startRecipient.id] : []));
      setMessage('');
      setQuery('');
      setResults([]);
      setSource('search');
    });
    void refresh();
    return () => { cancelled = true; };
  }, [visible]);

  // ── Loading candidates ─────────────────────────────────────────────────────
  const loadSearch = useCallback(async (text: string): Promise<Candidate[]> => {
    if (!user || !service || !text.trim()) return [];
    switch (service) {
      case 'spotify': {
        const tracks = await Spotify.searchTracks(user.id, text.trim());
        return tracks.map((t) => ({
          key: `s:${t.id}`,
          kind: 'song',
          title: t.name,
          subtitle: t.artists.map((a) => a.name).join(', '),
          coverUrl: t.album.images[0]?.url ?? '',
          serviceId: t.id,
          isrc: t.external_ids?.isrc ?? null,
        }));
      }
      case 'apple_music': {
        const tracks = await AppleMusic.searchTracks(user.id, text.trim());
        return tracks.map((t) => ({
          key: `a:${t.id}`,
          kind: 'song',
          title: t.attributes.name,
          subtitle: t.attributes.artistName,
          coverUrl: t.attributes.artwork ? AppleMusic.resolveArtworkUrl(t.attributes.artwork.url, 300) : '',
          serviceId: t.id,
        }));
      }
      case 'youtube_music': {
        const tracks = await YouTubeMusic.searchTracks(user.id, text.trim());
        return tracks.map((t) => {
          const info = extractYouTubeTrackInfo(t.snippet.channelTitle, t.snippet.title);
          const channel = t.snippet.channelTitle?.toLowerCase() ?? '';
          return {
            key: `y:${t.id.videoId}`,
            kind: 'song' as const,
            title: cleanTitle(info.title),
            subtitle: info.artist,
            coverUrl: t.snippet.thumbnails.medium.url,
            serviceId: t.id.videoId,
            ytTopicVerified: channel.endsWith(' - topic') || channel === 'topic',
          };
        });
      }
    }
  }, [service, user]);

  const loadRecent = useCallback(async (): Promise<Candidate[]> => {
    if (!user || !service) return [];
    const recent = service === 'apple_music'
      ? await AppleMusic.getRecentlyPlayed(user.id, 20)
      : service === 'spotify'
        ? await Spotify.getRecentlyPlayed(user.id, 20)
        : [];
    return recent.map((t, i) => ({
      key: `r:${t.id}:${i}`,
      kind: 'song',
      title: t.title,
      subtitle: t.artist,
      coverUrl: t.coverUrl,
      serviceId: t.id,
    }));
  }, [service, user]);

  const loadPlaylists = useCallback(async (): Promise<Candidate[]> => {
    if (!user || !service) return [];
    const lists: LibraryPlaylist[] = service === 'spotify'
      ? await Spotify.getUserPlaylists(user.id)
      : service === 'apple_music'
        ? await AppleMusic.getUserPlaylists(user.id)
        : await YouTubeMusic.getUserPlaylists(user.id);
    return lists.map((p) => ({
      key: `p:${p.id}`,
      kind: 'playlist',
      title: p.name,
      subtitle: p.trackCount > 0 ? `${p.trackCount} tracks` : serviceLabel(p.service),
      coverUrl: p.coverUrl,
      serviceId: p.id,
      trackCount: p.trackCount,
    }));
  }, [service, user]);

  // One effect drives every source, so only one request is ever in flight.
  useEffect(() => {
    if (!visible || draft) return;
    const isSearch = source === 'search';
    if (isSearch && !query.trim()) {
      const clear = setTimeout(() => { setResults([]); setLoadingResults(false); }, 0);
      return () => clearTimeout(clear);
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        setLoadingResults(true);
        try {
          const next = isSearch ? await loadSearch(query)
            : source === 'recent' ? await loadRecent()
            : await loadPlaylists();
          if (!cancelled) setResults(next);
        } catch (err) {
          if (!cancelled) {
            setResults([]);
            toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not load that' });
          }
        } finally {
          if (!cancelled) setLoadingResults(false);
        }
      })();
    }, isSearch ? 250 : 0);

    return () => { cancelled = true; clearTimeout(timer); };
  // `toast` is stable from its provider; listing it would restart searches.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, draft, source, query, loadSearch, loadRecent, loadPlaylists]);

  // ── Choosing ───────────────────────────────────────────────────────────────
  const choose = async (candidate: Candidate) => {
    if (!service) return;
    if (candidate.kind === 'song') {
      setDraft({
        kind: 'song',
        title: candidate.title,
        artist: candidate.subtitle,
        coverUrl: candidate.coverUrl,
        service,
        serviceId: candidate.serviceId,
        isrc: candidate.isrc,
        ytTopicVerified: candidate.ytTopicVerified,
      });
      return;
    }

    // A playlist share stores its tracks, so they have to be read before we can
    // move on. This is the one slow step in the flow, hence the row spinner.
    setPreparing(candidate.key);
    try {
      const tracks = await getPlaylistTracks(candidate.serviceId);
      if (tracks.length === 0) throw new EmptyPlaylistError(candidate.title);
      setDraft({
        kind: 'playlist',
        title: candidate.title,
        coverUrl: candidate.coverUrl,
        service,
        playlistId: candidate.serviceId,
        tracks: tracks.map(toTrackPayload),
      });
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not read that playlist' });
    } finally {
      setPreparing(null);
    }
  };

  const toggleRecipient = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const send = async () => {
    if (!user || !draft || selected.size === 0) return;
    setSending(true);
    try {
      await sendShare(user.id, draft, [...selected], message.trim() || null);
      const names = mutualFollows.filter((f) => selected.has(f.id)).map((f) => f.display_name);
      toast.show({
        kind: 'success',
        message: names.length === 1 ? `Sent to ${names[0]}` : `Sent to ${selected.size} people`,
      });
      onSent?.();
      onClose();
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not send that' });
    } finally {
      setSending(false);
    }
  };

  const sources: { id: Source; label: string }[] = useMemo(() => [
    { id: 'search', label: 'Search' },
    ...(service === 'youtube_music' ? [] : [{ id: 'recent' as const, label: 'Recent' }]),
    { id: 'playlists', label: 'Playlists' },
  ], [service]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!service) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Send a song">
        <EmptyState
          compact
          icon="musical-notes-outline"
          title="No music service yet"
          body="Connect one in Settings and you can send from your library."
        />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={draft ? 'Send to' : 'Pick something'}>
      {draft ? (
        <>
          <View style={s.chosen}>
            <CoverArt uri={draft.coverUrl} size={52} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong" numberOfLines={1}>{draft.title}</Txt>
              <Txt variant="caption" color="text3" numberOfLines={1}>
                {draft.kind === 'song' ? draft.artist : `${draft.tracks.length} tracks`}
              </Txt>
            </View>
            {!initialDraft ? (
              <TouchableOpacity onPress={() => setDraft(null)} hitSlop={10} accessibilityRole="button">
                <Txt variant="captionStrong" color="accent">Change</Txt>
              </TouchableOpacity>
            ) : null}
          </View>

          <FlatList
            data={mutualFollows}
            keyExtractor={(f) => f.id}
            style={s.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <EmptyState
                compact
                icon="people-outline"
                title="No one to send to yet"
                body="You can send to people who follow you back. Follow someone and ask them to follow you."
              />
            }
            renderItem={({ item: friend }) => {
              const on = selected.has(friend.id);
              return (
                <ListRow
                  leading={<Avatar name={friend.display_name} avatarUrl={friend.avatar_url} size={44} />}
                  title={friend.display_name}
                  subtitle={`@${friend.username}`}
                  onPress={() => toggleRecipient(friend.id)}
                  trailing={
                    <Ionicons
                      name={on ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={on ? colors.accent : colors.line}
                    />
                  }
                />
              );
            }}
          />

          <View style={s.footer}>
            <TextInput
              style={s.note}
              placeholder="Add a message"
              placeholderTextColor={colors.text4}
              value={message}
              onChangeText={setMessage}
              maxLength={200}
              editable={!sending}
            />
            <Button
              label={selected.size > 1 ? `Send to ${selected.size}` : 'Send'}
              icon="paper-plane"
              loading={sending}
              disabled={selected.size === 0}
              onPress={send}
            />
          </View>
        </>
      ) : (
        <>
          <View style={s.searchRow}>
            <Ionicons name="search-outline" size={17} color={colors.text3} />
            <TextInput
              style={s.searchInput}
              placeholder={`Search ${serviceLabel(service)}`}
              placeholderTextColor={colors.text4}
              value={query}
              onChangeText={(t) => { setQuery(t); if (source !== 'search') setSource('search'); }}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {loadingResults ? <ActivityIndicator size="small" color={colors.text3} /> : null}
          </View>

          <View style={s.sourceRow}>
            {sources.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                onPress={() => { setSource(entry.id); if (entry.id !== 'search') setQuery(''); }}
                style={[s.sourceChip, source === entry.id && s.sourceChipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: source === entry.id }}
              >
                <Txt variant="captionStrong" style={source === entry.id ? s.sourceTextOn : s.sourceText}>
                  {entry.label}
                </Txt>
              </TouchableOpacity>
            ))}
          </View>

          <FlatList
            data={results}
            keyExtractor={(c) => c.key}
            style={s.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              loadingResults ? (
                <View style={s.skeletons}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={s.skeletonRow}>
                      <Skeleton width={48} height={48} radius={8} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Skeleton width="65%" height={13} />
                        <Skeleton width="40%" height={11} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState
                  compact
                  icon={source === 'search' ? 'search-outline' : 'albums-outline'}
                  title={source === 'search' && !query.trim() ? 'What do you want to send?' : 'Nothing here'}
                  body={source === 'search' && !query.trim()
                    ? `Search ${serviceLabel(service)}, or pick from Recent and Playlists.`
                    : 'Try a different search.'}
                />
              )
            }
            renderItem={({ item: candidate }) => (
              <ListRow
                leading={<CoverArt uri={candidate.coverUrl} size={48} />}
                title={candidate.title}
                subtitle={candidate.subtitle}
                onPress={() => choose(candidate)}
                disabled={preparing !== null}
                trailing={
                  preparing === candidate.key
                    ? <ActivityIndicator size="small" color={colors.accent} />
                    : <Ionicons name="chevron-forward" size={18} color={colors.text3} />
                }
              />
            )}
          />
        </>
      )}
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  chosen: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.md,
    paddingHorizontal: spacing.lg, minHeight: 46,
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
  },
  searchInput: { flex: 1, ...type.body, color: colors.text },
  sourceRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  sourceChip: {
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm - 2,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
  },
  sourceChipOn: { backgroundColor: colors.text },
  sourceText: { color: colors.text2 },
  sourceTextOn: { color: colors.bg },
  list: { flexGrow: 0, maxHeight: 380 },
  skeletons: { paddingHorizontal: spacing.lg, gap: spacing.lg, paddingTop: spacing.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.line,
  },
  note: {
    flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    ...type.callout, color: colors.text,
  },
}));
