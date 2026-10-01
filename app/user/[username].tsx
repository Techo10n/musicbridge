import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { supabase } from '../../lib/supabase';
import { relationshipFor } from '../../lib/friends';
import {
  buildTasteProfile, normalizeName, sameServiceBonus, tasteMatch, tasteSummary, TasteMatch,
} from '../../lib/taste';
import { makeStyles, useTheme } from '../../lib/theme';
import { timeAgo } from '../../lib/utils';
import { SharedItem, User } from '../../types';
import { ShareComposer } from '../../components/ShareComposer';
import {
  AppBar, Avatar, Button, CoverArt, EmptyState, ListRow, SectionTitle, ServiceChip, Skeleton, Txt, useToast,
} from '../../components/ui';

/**
 * Someone else's profile. A route rather than a modal so it can be linked to,
 * shared, and reached from a notification — the invite link points here.
 */
export default function UserProfile() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { username } = useLocalSearchParams<{ username: string }>();
  const { user: me } = useAuth();
  const { mutualFollows, requests, pending, followUser, refresh } = useFollows();

  const [person, setPerson] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState<SharedItem[]>([]);
  const [match, setMatch] = useState<TasteMatch | null>(null);
  const [adding, setAdding] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const handle = (username ?? '').replace(/^@/, '').toLowerCase();

  useEffect(() => {
    if (!handle) return;
    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('user_public_profiles')
          .select('*')
          .eq('username', handle)
          .single();
        if (error) throw error;
        if (cancelled) return;
        setPerson(data as User);

        // Their public drops are readable if you follow them; their direct
        // shares to other people are not. Either way this is what RLS allows.
        const { data: theirShares } = await supabase
          .from('shared_items')
          .select('id, sender_id, recipient_id, type, title, artist, cover_image_url, tracks_count, created_at')
          .eq('sender_id', data.id)
          .order('created_at', { ascending: false })
          .limit(12);
        if (!cancelled) setShares((theirShares ?? []) as SharedItem[]);

        if (me?.id) {
          const { data: mineRows } = await supabase
            .from('shared_items')
            .select('artist, title')
            .eq('sender_id', me.id)
            .limit(200);
          if (cancelled) return;

          const mine = buildTasteProfile(mineRows ?? [], me.favorite_song);
          const theirs = buildTasteProfile(
            (theirShares ?? []).map((r) => ({ artist: r.artist, title: r.title })),
            (data as User).favorite_song,
          );
          setMatch(tasteMatch(mine, theirs, {
            sameService: sameServiceBonus(me.primary_service, (data as User).primary_service),
            sameFavoriteArtist:
              normalizeName(me.favorite_song?.artist) !== ''
              && normalizeName(me.favorite_song?.artist) === normalizeName((data as User).favorite_song?.artist),
          }));
        }
      } catch (err) {
        console.error('[user] load failed:', err);
        if (!cancelled) setPerson(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [handle, me]);

  const relationship = person
    ? relationshipFor(person.id, { friends: mutualFollows, requests, pending })
    : 'none';

  const add = useCallback(async () => {
    if (!person || adding) return;
    setAdding(true);
    try {
      await followUser(person.id);
      await refresh();
      toast.show({ kind: 'success', message: `Added ${person.display_name}` });
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not add them' });
    } finally {
      setAdding(false);
    }
  }, [person, adding, followUser, refresh, toast]);

  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <AppBar onBack={() => router.back()} title="" />
        <View style={s.loading}>
          <Skeleton width={96} height={96} radius={48} />
          <Skeleton width={160} height={20} />
          <Skeleton width={110} height={14} />
        </View>
      </SafeAreaView>
    );
  }

  if (!person) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <AppBar onBack={() => router.back()} title="" />
        <EmptyState
          icon="person-outline"
          title="No such person"
          body={`Nobody here goes by @${handle}. Usernames are exact.`}
          action={{ label: 'Go back', onPress: () => router.back() }}
        />
      </SafeAreaView>
    );
  }

  const isMe = person.id === me?.id;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <AppBar onBack={() => router.back()} title={`@${person.username}`} />

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Avatar name={person.display_name} avatarUrl={person.avatar_url} size={92} ring="accent" />
          <Txt variant="title1" align="center">{person.display_name}</Txt>
          {person.bio ? <Txt variant="callout" color="text3" align="center">{person.bio}</Txt> : null}
          {person.primary_service ? <ServiceChip service={person.primary_service} style={s.centred} /> : null}
        </View>

        {!isMe ? (
          <View style={s.actions}>
            {relationship === 'friends' ? (
              <Button label="Send a song" icon="paper-plane" onPress={() => setComposerOpen(true)} style={s.grow} />
            ) : (
              <Button
                label={relationship === 'request' ? 'Add back' : relationship === 'pending' ? 'Waiting for them' : 'Add'}
                onPress={add}
                loading={adding}
                disabled={relationship === 'pending'}
                variant={relationship === 'pending' ? 'secondary' : 'primary'}
                style={s.grow}
              />
            )}
          </View>
        ) : null}

        {!isMe && match ? (
          <View style={s.matchCard}>
            <View style={s.matchCircle}>
              <Txt variant="title2" color="accent">{match.score === null ? '—' : `${match.score}%`}</Txt>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="bodyStrong">{match.score === null ? 'Too early to tell' : 'Taste match'}</Txt>
              <Txt variant="caption" color="text3">{tasteSummary(match)}</Txt>
              {match.sharedArtists.length > 0 ? (
                <Txt variant="caption" color="text4" numberOfLines={2} style={s.matchArtists}>
                  {match.sharedArtists.slice(0, 4).join(' · ')}
                </Txt>
              ) : null}
            </View>
          </View>
        ) : null}

        <SectionTitle title="Recent" />
        {shares.length === 0 ? (
          <EmptyState
            compact
            icon="disc-outline"
            title="Nothing public yet"
            body={`When ${person.display_name} drops something for everyone, it turns up here.`}
          />
        ) : (
          shares.map((item) => (
            <ListRow
              key={item.id}
              leading={<CoverArt uri={item.cover_image_url} size={48} />}
              title={item.title}
              subtitle={[item.artist, timeAgo(item.created_at)].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/song/${item.id}`)}
              trailing={<Ionicons name="chevron-forward" size={18} color={colors.text3} />}
            />
          ))
        )}
      </ScrollView>

      <ShareComposer
        visible={composerOpen}
        recipient={person}
        onClose={() => setComposerOpen(false)}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  loading: { alignItems: 'center', gap: spacing.lg, paddingTop: spacing.xxl },
  body: { paddingBottom: 110, gap: spacing.md },
  header: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xxl, paddingTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  grow: { flex: 1 },
  centred: { alignSelf: 'center' },
  matchCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    marginHorizontal: spacing.lg, padding: spacing.lg,
    backgroundColor: colors.accentSoft, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.accentBorder,
  },
  matchCircle: {
    width: 62, height: 62, borderRadius: 31,
    backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  matchArtists: { marginTop: 2 },
}));
