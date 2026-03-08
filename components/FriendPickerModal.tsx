import { useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useFriends } from '../hooks/useFriends';
import { Friendship, User } from '../types';

interface FriendPickerModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (friend: User, message: string) => void;
}

function resolveFriend(friendship: Friendship, currentUserId: string): User | null {
  if (friendship.requester_id === currentUserId) {
    return (friendship.addressee as User) ?? null;
  }
  return (friendship.requester as User) ?? null;
}

export function FriendPickerModal({
  visible,
  title = 'Send to Friend',
  onClose,
  onSelect,
}: FriendPickerModalProps) {
  const [message, setMessage] = useState('');
  const { user } = useAuth();
  const { friends } = useFriends();

  const handleSelect = (friendship: Friendship) => {
    if (!user) return;
    const friend = resolveFriend(friendship, user.id);
    if (!friend) return;
    onSelect(friend, message.trim());
    setMessage('');
    onClose();
  };

  const handleClose = () => {
    setMessage('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
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

        <Text style={styles.sectionLabel}>Choose a friend</Text>

        <FlatList
          data={friends}
          keyExtractor={(f) => f.id}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No friends yet. Add some from the Friends tab!
            </Text>
          }
          renderItem={({ item: friendship }) => {
            if (!user) return null;
            const friend = resolveFriend(friendship, user.id);
            if (!friend) return null;
            const initials = (friend.display_name[0] ?? friend.username[0] ?? '?').toUpperCase();
            return (
              <TouchableOpacity
                style={styles.friendRow}
                onPress={() => handleSelect(friendship)}
                activeOpacity={0.8}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.display_name}</Text>
                  <Text style={styles.friendUsername}>@{friend.username}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    color: '#666',
    fontSize: 18,
  },
  messageRow: {
    paddingHorizontal: 16,
    paddingTop: 16,
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
  sectionLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 68,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 32,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
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
});
