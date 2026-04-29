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
import { Ionicons } from '@expo/vector-icons';
import { useFollows } from '../hooks/useFollows';
import { User } from '../types';
import { colors } from '../lib/theme';

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
      transparent
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose} />

      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.fg3} />
          </TouchableOpacity>
        </View>

        {/* "SUGGESTED" section label */}
        <View style={styles.sectionLabelRow}>
          <Text style={styles.sectionLabel}>Mutual follows</Text>
        </View>

        <FlatList
          data={following}
          keyExtractor={(u) => u.id}
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              You can only share with mutual followers. Follow someone and have them follow you back.
            </Text>
          }
          renderItem={({ item: friend }) => {
            const initials = (friend.display_name[0] ?? friend.username[0] ?? '?').toUpperCase();
            return (
              <TouchableOpacity
                style={styles.userRow}
                onPress={() => handleSelect(friend)}
                activeOpacity={0.8}
              >
                <View style={styles.avatarContainer}>
                  {friend.avatar_url ? (
                    <Image source={{ uri: friend.avatar_url }} style={styles.avatarImage} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{friend.display_name}</Text>
                  <Text style={styles.userUsername}>@{friend.username}</Text>
                </View>
                <View style={styles.sendBtn}>
                  <Text style={styles.sendBtnText}>Send</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />

        {/* Bottom bar: message + send */}
        <View style={styles.bottomBar}>
          <TextInput
            style={styles.messageInput}
            placeholder="Add a message (optional)"
            placeholderTextColor={colors.fg4}
            value={message}
            onChangeText={setMessage}
            maxLength={200}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '80%', paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: 'center', marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 12,
  },
  sheetTitle: { fontSize: 22, fontWeight: '700', color: colors.fg, letterSpacing: -0.4 },
  sectionLabelRow: { paddingHorizontal: 20, paddingBottom: 6 },
  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: colors.fg3,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  list: { flex: 1 },
  separator: { height: 1, backgroundColor: colors.line, marginLeft: 72 },
  emptyText: {
    color: colors.fg3, fontSize: 14, textAlign: 'center',
    marginTop: 48, paddingHorizontal: 32, lineHeight: 20,
  },
  userRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 11, gap: 12,
  },
  avatarContainer: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden' },
  avatarImage: { width: 44, height: 44, borderRadius: 22 },
  avatarFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: colors.fg3, fontSize: 16, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { color: colors.fg, fontSize: 15, fontWeight: '600', marginBottom: 2 },
  userUsername: { color: colors.fg3, fontSize: 12 },
  sendBtn: {
    borderRadius: 999, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  sendBtnText: { fontSize: 13, fontWeight: '600', color: colors.fg },
  bottomBar: {
    borderTopWidth: 1, borderTopColor: colors.line,
    padding: 14, backgroundColor: colors.bg,
  },
  messageInput: {
    backgroundColor: colors.bgInput, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 10,
    color: colors.fg, fontSize: 13,
    borderWidth: 1, borderColor: colors.line,
  },
});
