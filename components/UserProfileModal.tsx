import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useFollows } from '../hooks/useFollows';
import { User, MusicService } from '../types';

const SERVICE_COLORS: Record<MusicService, string> = {
  spotify: '#1DB954',
  apple_music: '#fc3c44',
  youtube_music: '#FF0000',
};

const SERVICE_LABELS: Record<MusicService, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
};

interface UserProfileModalProps {
  userId: string | null; // null = closed
  onClose: () => void;
}

interface ProfileData extends Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'favorite_song' | 'primary_service'> {}

export function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const { user: currentUser } = useAuth();
  const { isFollowing, followUser, unfollowUser } = useFollows();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const isOwnProfile = currentUser?.id === userId;
  const following = userId ? isFollowing(userId) : false;

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setFollowerCount(0);
      setFollowingCount(0);
      return;
    }

    const fetchProfile = async () => {
      setLoadingProfile(true);
      try {
        const [profileRes, followerRes, followingRes] = await Promise.all([
          supabase
            .from('users')
            .select('id, username, display_name, avatar_url, bio, favorite_song, primary_service')
            .eq('id', userId)
            .single(),
          supabase
            .from('follows')
            .select('id', { count: 'exact', head: true })
            .eq('following_id', userId),
          supabase
            .from('follows')
            .select('id', { count: 'exact', head: true })
            .eq('follower_id', userId),
        ]);

        if (profileRes.data) {
          setProfile(profileRes.data as ProfileData);
        }
        setFollowerCount(followerRes.count ?? 0);
        setFollowingCount(followingRes.count ?? 0);
      } catch (err) {
        console.error('[UserProfileModal] fetch error:', err);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfile();
  }, [userId]);

  const handleFollowToggle = async () => {
    if (!userId) return;
    setFollowLoading(true);
    try {
      if (following) {
        await unfollowUser(userId);
        setFollowerCount((c) => Math.max(0, c - 1));
      } else {
        await followUser(userId);
        setFollowerCount((c) => c + 1);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setFollowLoading(false);
    }
  };

  const initials = profile
    ? profile.display_name
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
    : '';

  return (
    <Modal
      visible={userId !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {profile?.display_name ?? ''}
          </Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        {loadingProfile ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : profile ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar */}
            <View style={styles.avatarRow}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>
              )}
            </View>

            {/* Name + username */}
            <Text style={styles.displayName}>{profile.display_name}</Text>
            <Text style={styles.username}>@{profile.username}</Text>

            {/* Primary service badge */}
            {profile.primary_service && (
              <View
                style={[
                  styles.serviceBadge,
                  { backgroundColor: SERVICE_COLORS[profile.primary_service] + '22' },
                ]}
              >
                <View
                  style={[
                    styles.serviceDot,
                    { backgroundColor: SERVICE_COLORS[profile.primary_service] },
                  ]}
                />
                <Text
                  style={[
                    styles.serviceLabel,
                    { color: SERVICE_COLORS[profile.primary_service] },
                  ]}
                >
                  {SERVICE_LABELS[profile.primary_service]}
                </Text>
              </View>
            )}

            {/* Follow / unfollow button */}
            {!isOwnProfile && (
              <TouchableOpacity
                style={[styles.followButton, following && styles.followingButton]}
                onPress={handleFollowToggle}
                disabled={followLoading}
                activeOpacity={0.8}
              >
                {followLoading ? (
                  <ActivityIndicator color={following ? '#888' : '#000'} size="small" />
                ) : (
                  <Text style={[styles.followButtonText, following && styles.followingButtonText]}>
                    {following ? 'Following' : 'Follow'}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Stats row */}
            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{followerCount}</Text>
                <Text style={styles.statLabel}>Followers</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNumber}>{followingCount}</Text>
                <Text style={styles.statLabel}>Following</Text>
              </View>
            </View>

            {/* Bio */}
            {profile.bio ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Bio</Text>
                <Text style={styles.bio}>{profile.bio}</Text>
              </View>
            ) : null}

            {/* Favorite song */}
            {profile.favorite_song ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Favorite Song</Text>
                <View style={styles.favoriteSongCard}>
                  {profile.favorite_song.cover_url ? (
                    <Image
                      source={{ uri: profile.favorite_song.cover_url }}
                      style={styles.favoriteSongCover}
                    />
                  ) : null}
                  <View style={styles.favoriteSongInfo}>
                    <Text style={styles.favoriteSongTitle} numberOfLines={1}>
                      {profile.favorite_song.title}
                    </Text>
                    <Text style={styles.favoriteSongArtist} numberOfLines={1}>
                      {profile.favorite_song.artist}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.favoriteSongDot,
                      { backgroundColor: SERVICE_COLORS[profile.favorite_song.service] },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.errorText}>Could not load profile.</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#555',
    fontSize: 15,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 32,
  },
  avatarRow: {
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatarPlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#888',
    fontSize: 28,
    fontWeight: '700',
  },
  displayName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 4,
  },
  username: {
    color: '#666',
    fontSize: 15,
    marginBottom: 14,
    textAlign: 'center',
  },
  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 18,
    gap: 6,
  },
  serviceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  serviceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  followButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 40,
    marginBottom: 24,
    minWidth: 140,
    alignItems: 'center',
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#444',
  },
  followButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  followingButtonText: {
    color: '#888',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    gap: 32,
    marginBottom: 28,
    width: '100%',
    justifyContent: 'center',
  },
  stat: {
    alignItems: 'center',
    gap: 2,
  },
  statNumber: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statLabel: {
    color: '#666',
    fontSize: 12,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#2a2a2a',
  },
  section: {
    width: '100%',
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  bio: {
    color: '#ccc',
    fontSize: 15,
    lineHeight: 22,
  },
  favoriteSongCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  favoriteSongCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
  },
  favoriteSongInfo: {
    flex: 1,
  },
  favoriteSongTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  favoriteSongArtist: {
    color: '#888',
    fontSize: 13,
  },
  favoriteSongDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
