import { useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFollows } from '../hooks/useFollows';
import { User } from '../types';

interface FriendPickerModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (user: User, message: string) => void;
}

export function FriendPickerModal({
  visible,
  title = 'Send to Someone',
  onClose,
  onSelect,
}: FriendPickerModalProps) {
  const [message, setMessage] = useState('');
  const { mutualFollows: following, refresh } = useFollows();

  useEffect(() => {
    if (!visible) return;
    void refresh();
  }, [visible, refresh]);

  const handleSelect = (user: User) => {
    onSelect(user, message.trim());
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

        <Text style={styles.sectionLabel}>Mutual follows</Text>

        <FlatList
          data={following}
          keyExtractor={(u) => u.id}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              You can only share with mutual followers. Follow someone and have them follow you back.
            </Text>
          }
          renderItem={({ item: user }) => {
            const initials = (user.display_name[0] ?? user.username[0] ?? '?').toUpperCase();
            return (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => handleSelect(user)}
                activeOpacity={0.8}
              >
                <View style={styles.avatarContainer}>
                  {user.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{user.display_name}</Text>
                  <Text style={styles.userUsername}>@{user.username}</Text>
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
    lineHeight: 20,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
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
  userInfo: {
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  userUsername: {
    color: '#666',
    fontSize: 13,
  },
});
