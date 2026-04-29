import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { User } from '../types';

interface FriendListItemProps {
  user: User;
  isFollowing: boolean;
  onFollow: (userId: string) => void;
  onUnfollow: (userId: string) => void;
  onShare?: (user: User) => void;
  showShare?: boolean;
  onViewProfile?: (user: User) => void;
}

export function FriendListItem({
  user,
  isFollowing,
  onFollow,
  onUnfollow,
  onShare,
  showShare = false,
  onViewProfile,
}: FriendListItemProps) {
  const initials = user.display_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <View style={styles.container}>
      {/* Avatar + info — tappable to view profile */}
      <TouchableOpacity
        style={styles.profileTouchable}
        onPress={() => onViewProfile?.(user)}
        activeOpacity={onViewProfile ? 0.7 : 1}
        disabled={!onViewProfile}
      >
        {user.avatar_url ? (
          <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.initials}>{initials}</Text>
          </View>
        )}

        {/* Name + username */}
        <View style={styles.info}>
          <Text style={styles.displayName} numberOfLines={1}>
            {user.display_name}
          </Text>
          <Text style={styles.username}>@{user.username}</Text>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        {showShare && isFollowing && (
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => onShare?.(user)}
            activeOpacity={0.8}
          >
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.followButton, isFollowing && styles.followingButton]}
          onPress={() => (isFollowing ? onUnfollow(user.id) : onFollow(user.id))}
          activeOpacity={0.8}
        >
          <Text style={[styles.followButtonText, isFollowing && styles.followingButtonText]}>
            {isFollowing ? 'Following' : 'Follow'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  profileTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2c2822',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#8a8075',
    fontSize: 15,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  displayName: {
    color: '#f5f0e8',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  username: {
    color: '#6a6258',
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareButton: {
    backgroundColor: '#2c2822',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#332e28',
  },
  shareButtonText: {
    color: '#f5f0e8',
    fontSize: 13,
    fontWeight: '600',
  },
  followButton: {
    backgroundColor: '#7C5BF4',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  followingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#3e3932',
  },
  followButtonText: {
    color: '#f5f3ff',
    fontSize: 13,
    fontWeight: '700',
  },
  followingButtonText: {
    color: '#8a8075',
  },
});
