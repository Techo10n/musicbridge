import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, ScrollView,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useFollows } from '../hooks/useFollows';
import { makeStyles, serviceColor, useTheme } from '../lib/theme';
import { serviceLabelShort } from '../lib/services';
import { User } from '../types';
import { CoverArt, useToast } from './ui';
import { ShareComposer } from './ShareComposer';

interface UserProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const { isFollowing, followUser, unfollowUser, getFollowCounts } = useFollows();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [sharedCount, setSharedCount] = useState(0);
  const [tasteScore, setTasteScore] = useState<number | null>(null);
  const [sharedArtists, setSharedArtists] = useState(0);
  const [recentShare, setRecentShare] = useState<{ title: string; artist: string; coverUrl: string | null } | null>(null);
  const [topShares, setTopShares] = useState<{ title: string; artist: string; coverUrl: string | null }[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!userId) {
        if (!cancelled) { setProfile(null); setComposerOpen(false); }
        return;
      }
      if (!cancelled) setLoading(true);
      try {
        // Another user's row — public profile view only, never the base
        // `users` table, which now only allows owner-only reads of the OAuth
        // token columns it holds.
        const { data } = await supabase.from('user_public_profiles').select('*').eq('id', userId).single();
        setProfile(data as User);

        // Follow counts
        const counts = await getFollowCounts(userId);
        setFollowCounts(counts);

        // Shared count
        const { count } = await supabase.from('shared_items').select('id', { count: 'exact', head: true }).eq('sender_id', userId);
        setSharedCount(count ?? 0);

        // Their recent shared items (for "currently listening" approximation + taste)
        const { data: theirShares } = await supabase
          .from('shared_items')
          .select('title, artist, cover_image_url, created_at')
          .eq('sender_id', userId)
          .order('created_at', { ascending: false })
          .limit(20);

        if (theirShares?.length) {
          setRecentShare({
            title: theirShares[0].title ?? 'Unknown',
            artist: theirShares[0].artist ?? '',
            coverUrl: theirShares[0].cover_image_url,
          });
          setTopShares(theirShares.slice(0, 5).map(s => ({ title: s.title ?? '', artist: s.artist ?? '', coverUrl: s.cover_image_url })));
        }

        // Compute a simple taste score using shared artist names
        if (currentUser) {
          const { data: myShares } = await supabase
            .from('shared_items')
            .select('artist')
            .eq('sender_id', currentUser.id)
            .limit(50);
          const myArtists = new Set((myShares ?? []).map((s: any) => (s.artist ?? '').toLowerCase().trim()).filter(Boolean));
          const theirArtists = new Set((theirShares ?? []).map((s: any) => (s.artist ?? '').toLowerCase().trim()).filter(Boolean));

          let overlap = 0;
          for (const a of myArtists) { if (theirArtists.has(a)) overlap++; }
          const union = new Set([...myArtists, ...theirArtists]).size;
          const jaccard = union > 0 ? overlap / union : 0;
          setSharedArtists(overlap);
          // Scale to a reasonable score (baseline 35 + jaccard * 50, capped at 98)
          setTasteScore(Math.min(98, Math.round(35 + jaccard * 50 + (myArtists.size + theirArtists.size > 5 ? 10 : 0))));
        }
      } catch (err) {
        console.error('[UserProfileModal]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // `getFollowCounts` is a stable useCallback from useFollows; listing it here
  // adds a dependency that never changes but makes the lint rule's job harder.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, currentUser]);

  const handleFollow = async () => {
    if (!userId) return;
    try {
      if (isFollowing(userId)) await unfollowUser(userId);
      else await followUser(userId);
    } catch { toast.show({ kind: 'error', message: 'Could not update follow status' }); }
  };

  const showUnavailable = (feature: string) => {
    Alert.alert(feature, `${feature} is not currently available.`);
  };

  const getInitials = (target: User) => {
    const raw = (target.display_name ?? '').trim() || (target.username ?? '').trim() || 'U';
    const words = raw.split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U';
  };

  if (!userId) return null;

  return (
    <Modal visible={!!userId} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {loading || !profile ? (
          <View style={styles.loadingCenter}>
            {loading
              ? <ActivityIndicator color={colors.accent} size="large" />
              : <Text style={styles.errorText}>User not found</Text>
            }
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>

            {/* ── App bar ── */}
            <View style={styles.appBar}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-back" size={22} color={colors.text2} />
              </TouchableOpacity>
              <Text style={styles.appBarUsername} numberOfLines={1}>@{profile.username}</Text>
              <View style={styles.appBarRight}>
                <TouchableOpacity onPress={() => showUnavailable('Profile notifications')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="notifications-outline" size={22} color={colors.text2} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => showUnavailable('Profile options')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-horizontal" size={22} color={colors.text2} />
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Avatar + stats ── */}
            <View style={styles.profileTop}>
              <View style={styles.avatarRing}>
                <View style={styles.avatarRingGap}>
                  {profile.avatar_url
                    ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                    : (
                      <View style={styles.avatarFallback}>
                        <Text style={styles.avatarInitials}>
                          {getInitials(profile)}
                        </Text>
                      </View>
                    )
                  }
                </View>
              </View>

              <View style={styles.statsBlock}>
                {[
                  [followCounts.following, 'Following'],
                  [followCounts.followers, 'Followers'],
                  [sharedCount, 'Shared'],
                ].map(([val, label]) => (
                  <View key={label as string} style={styles.stat}>
                    <Text style={styles.statNum}>{val}</Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* ── Name + bio ── */}
            <View style={styles.bioBlock}>
              <Text style={styles.displayName}>{profile.display_name}</Text>
              {profile.bio
                ? <Text style={styles.bio}>{profile.bio}</Text>
                : <Text style={styles.bioEmpty}>No bio</Text>
              }
            </View>

            {/* ── Taste match banner ── */}
            {tasteScore !== null && (
              <View style={styles.matchBanner}>
                <View style={styles.matchCircle}>
                  <Text style={styles.matchPct}>{tasteScore}%</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTitle}>
                    {tasteScore >= 80 ? 'High taste match' : tasteScore >= 60 ? 'Good taste match' : 'Some overlap'}
                  </Text>
                  <Text style={styles.matchSub}>
                    {sharedArtists > 0 ? `${sharedArtists} shared artist${sharedArtists !== 1 ? 's' : ''}` : 'Based on listening activity'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.blendBtn} onPress={() => showUnavailable('Friend Blend')} activeOpacity={0.8}>
                  <Text style={styles.blendBtnText}>Open Blend</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Follow / Message / More ── */}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.followBtn, isFollowing(userId) && styles.followBtnFollowing]}
                onPress={handleFollow}
                activeOpacity={0.85}
              >
                <Text style={[styles.followBtnText, isFollowing(userId) && styles.followBtnTextFollowing]}>
                  {isFollowing(userId) ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.messageBtn}
                onPress={() => setComposerOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="paper-plane-outline" size={14} color={colors.text} />
                <Text style={styles.messageBtnText}>Message</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.moreBtn} onPress={() => showUnavailable('Profile options')} activeOpacity={0.85}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* ── Service badge ── */}
            {profile.primary_service && (
              <View style={styles.svcRow}>
                <View style={styles.svcChip}>
                  <View style={[styles.svcDot, { backgroundColor: serviceColor(colors, profile.primary_service) }]} />
                  <Text style={styles.svcChipText}>{serviceLabelShort(profile.primary_service)}</Text>
                  <Text style={styles.svcChipPrimary}>Primary</Text>
                </View>
              </View>
            )}

            {/* ── Currently listening (most recent share as proxy) ── */}
            {recentShare && (
              <View style={styles.listeningCard}>
                <View style={{ position: 'relative', flexShrink: 0 }}>
                  <CoverArt uri={recentShare.coverUrl} size={48} radius={8} />
                  <View style={styles.liveDot} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.liveLabel}>● Last shared</Text>
                  <Text style={styles.listenTitle} numberOfLines={1}>{recentShare.title}</Text>
                  <Text style={styles.listenArtist} numberOfLines={1}>{recentShare.artist}</Text>
                </View>
                <TouchableOpacity onPress={() => setComposerOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="paper-plane-outline" size={18} color={colors.text3} />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Favorite song ── */}
            {profile.favorite_song && (
              <View style={styles.favCard}>
                <CoverArt uri={profile.favorite_song.cover_url} size={52} radius={9} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.favLabel}>♥ Favorite song</Text>
                  <Text style={styles.favTitle} numberOfLines={1}>{profile.favorite_song.title}</Text>
                  <Text style={styles.favArtist} numberOfLines={1}>{profile.favorite_song.artist}</Text>
                </View>
                {profile.favorite_song.service && (
                  <View style={[styles.svcDot, { backgroundColor: serviceColor(colors, profile.favorite_song.service), width: 10, height: 10, borderRadius: 5 }]} />
                )}
              </View>
            )}

            {/* ── Top shared songs (as "top artists this month" section) ── */}
            {topShares.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent shares</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.topSharesRow}>
                  {topShares.map((s, i) => (
                    <View key={i} style={styles.topShareItem}>
                      <CoverArt uri={s.coverUrl} size={72} radius={12} />
                      <Text style={styles.topShareTitle} numberOfLines={2}>{s.title}</Text>
                      <Text style={styles.topShareArtist} numberOfLines={1}>{s.artist}</Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

          </ScrollView>
        )}
      </View>

      {profile && (
        <ShareComposer
          visible={composerOpen}
          recipient={profile}
          onClose={() => setComposerOpen(false)}
        />
      )}
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: colors.text3, fontSize: 15 },

  // App bar
  appBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  appBarUsername: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  appBarRight: { flexDirection: 'row', gap: 14 },

  // Profile top
  profileTop: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 10, gap: 20,
  },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.accent, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarRingGap: {
    width: 92, height: 92, borderRadius: 46,
    backgroundColor: colors.bg, padding: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  avatarFallback: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 28, fontWeight: '700', color: colors.text },
  statsBlock: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center', gap: 2 },
  statNum: { fontSize: 18, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: colors.text3 },

  // Bio
  bioBlock: { paddingHorizontal: 20, paddingBottom: 10 },
  displayName: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 3 },
  bio: { fontSize: 13, color: colors.text2, lineHeight: 18 },
  bioEmpty: { fontSize: 13, color: colors.text4, fontStyle: 'italic' },

  // Taste match banner
  matchBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 14, padding: 14,
    borderRadius: 14, borderWidth: 1.5, borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  matchCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  matchPct: { fontSize: 16, fontWeight: '800', color: colors.accent },
  matchTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  matchSub: { fontSize: 12, color: colors.text3, marginTop: 2 },
  blendBtn: {
    borderRadius: 999, borderWidth: 1.5, borderColor: colors.accent,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  blendBtnText: { fontSize: 12, fontWeight: '600', color: colors.accent },

  // Follow/Message/More row
  actionRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingBottom: 14,
  },
  followBtn: {
    flex: 1, backgroundColor: colors.accent, borderRadius: 999,
    paddingVertical: 11, alignItems: 'center',
  },
  followBtnFollowing: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.lineStrong },
  followBtnText: { fontSize: 14, fontWeight: '700', color: colors.accentInk },
  followBtnTextFollowing: { color: colors.text3 },
  messageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: 999,
    paddingVertical: 11, borderWidth: 1, borderColor: colors.line,
  },
  messageBtnText: { fontSize: 14, fontWeight: '600', color: colors.text },
  moreBtn: {
    width: 42, backgroundColor: colors.surface, borderRadius: 999,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },

  // Service chip
  svcRow: { paddingHorizontal: 16, paddingBottom: 14, flexDirection: 'row' },
  svcChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface, borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: colors.line,
  },
  svcDot: { width: 8, height: 8, borderRadius: 4 },
  svcChipText: { fontSize: 12, color: colors.text2, fontWeight: '600' },
  svcChipPrimary: { fontSize: 10, color: colors.accent, fontWeight: '700', marginLeft: 2 },

  // Currently listening / last shared
  listeningCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 12, padding: 12,
    backgroundColor: colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  liveDot: {
    position: 'absolute', right: -3, bottom: -3,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2, borderColor: colors.surface,
  },
  liveLabel: { fontSize: 9, fontWeight: '700', color: colors.accent, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  listenTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  listenArtist: { fontSize: 12, color: colors.text3 },

  // Favorite song
  favCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 16, marginBottom: 16, padding: 12,
    borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  favLabel: { fontSize: 10, color: colors.danger, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  favTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  favArtist: { fontSize: 12, color: colors.text2, marginTop: 2 },

  // Top shares
  sectionHeader: { paddingHorizontal: 20, paddingBottom: 10, paddingTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  topSharesRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 14 },
  topShareItem: { width: 80, alignItems: 'center', gap: 5 },
  topShareTitle: { fontSize: 11, fontWeight: '600', color: colors.text, textAlign: 'center', lineHeight: 15 },
  topShareArtist: { fontSize: 10, color: colors.text3, textAlign: 'center' },
}));
