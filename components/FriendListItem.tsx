import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Friendship, User } from '../types';
import { useAuth } from '../hooks/useAuth';

interface FriendListItemProps {
  friendship: Friendship;
  onShare: (friend: User) => void;
  onAccept?: (friendshipId: string) => void;
  onDecline?: (friendshipId: string) => void;
  mode: 'friend' | 'pending';
}

export function FriendListItem({
  friendship,
  onShare,
  onAccept,
  onDecline,
  mode,
}: FriendListItemProps) {
  const { user: currentUser } = useAuth();

  // Determine which side of the friendship is the "other" person
  const other =
    friendship.requester_id === currentUser?.id
      ? friendship.addressee
      : friendship.requester;

  if (!other) return null;

  const initials = other.display_name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <View style={styles.container}>
      {/* Avatar */}
      {other.avatar_url ? (
        <Image source={{ uri: other.avatar_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
      )}

      {/* Name + username */}
      <View style={styles.info}>
        <Text style={styles.displayName} numberOfLines={1}>
          {other.display_name}
        </Text>
        <Text style={styles.username}>@{other.username}</Text>
      </View>

      {/* Actions */}
      {mode === 'friend' ? (
        <TouchableOpacity
          style={styles.shareButton}
          onPress={() => onShare(other as User)}
          activeOpacity={0.8}
        >
          <Text style={styles.shareButtonText}>Share</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.pendingActions}>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => onAccept?.(friendship.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.acceptText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.declineButton}
            onPress={() => onDecline?.(friendship.id)}
            activeOpacity={0.8}
          >
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#888',
    fontSize: 15,
    fontWeight: '700',
  },
  info: {
    flex: 1,
  },
  displayName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  username: {
    color: '#666',
    fontSize: 13,
  },
  shareButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 16,
  },
  shareButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#1DB954',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  acceptText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  declineButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  declineText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
});
