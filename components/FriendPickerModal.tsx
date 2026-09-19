import { useEffect, useState } from 'react';
import { FlatList, TextInput, TouchableOpacity, View } from 'react-native';
import { useFollows } from '../hooks/useFollows';
import { makeStyles, useTheme } from '../lib/theme';
import { User } from '../types';
import { Avatar, EmptyState, ListRow, Sheet, Txt } from './ui';

interface FriendPickerModalProps {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (user: User, message: string) => void;
}

/**
 * Pick one mutual follower to send something to, with an optional note.
 * Replaced by the share composer in a later phase; kept themed until then.
 */
export function FriendPickerModal({ visible, title = 'Send to someone', onClose, onSelect }: FriendPickerModalProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const [message, setMessage] = useState('');
  const { mutualFollows: friends, refresh } = useFollows();

  useEffect(() => {
    if (!visible) return;
    void Promise.resolve().then(refresh);
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
    <Sheet visible={visible} onClose={handleClose} title={title}>
      <Txt variant="micro" color="text3" style={s.sectionLabel}>Mutual follows</Txt>
      <FlatList
        data={friends}
        keyExtractor={(u) => u.id}
        style={s.list}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState
            compact
            icon="people-outline"
            title="No one to send to yet"
            body="You can share with people who follow you back. Follow someone and ask them to follow you."
          />
        }
        renderItem={({ item: friend }) => (
          <ListRow
            leading={<Avatar name={friend.display_name} avatarUrl={friend.avatar_url} size={44} />}
            title={friend.display_name}
            subtitle={`@${friend.username}`}
            trailing={
              <TouchableOpacity style={s.sendBtn} onPress={() => handleSelect(friend)} accessibilityRole="button">
                <Txt variant="captionStrong">Send</Txt>
              </TouchableOpacity>
            }
            onPress={() => handleSelect(friend)}
            separator
          />
        )}
      />
      <View style={s.bottomBar}>
        <TextInput
          style={s.messageInput}
          placeholder="Add a message (optional)"
          placeholderTextColor={colors.text4}
          value={message}
          onChangeText={setMessage}
          maxLength={200}
        />
      </View>
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  sectionLabel: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xs },
  list: { flexGrow: 0, maxHeight: 360 },
  sendBtn: {
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    paddingHorizontal: spacing.lg - 2, paddingVertical: spacing.sm - 1,
  },
  bottomBar: { borderTopWidth: 1, borderTopColor: colors.line, padding: spacing.lg - 2 },
  messageInput: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2,
    ...type.callout, color: colors.text,
  },
}));
