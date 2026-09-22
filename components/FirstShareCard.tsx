import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../lib/theme';
import { Button, Txt } from './ui';

const dismissedKey = (userId: string) => `museaic_first_share_dismissed_${userId}`;

/**
 * Shown once, after onboarding, in place of the welcome alert the app used to
 * pop on first launch. It points at the one action a new account has no reason
 * to discover on its own, and stays dismissed per user.
 */
export function FirstShareCard({ userId, onSend }: { userId: string | undefined; onSend: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(dismissedKey(userId));
        if (!cancelled && !dismissed) setVisible(true);
      } catch {
        // A card we cannot decide about is better left hidden than shown twice.
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const dismiss = () => {
    setVisible(false);
    if (userId) AsyncStorage.setItem(dismissedKey(userId), '1').catch(() => {});
  };

  if (!visible) return null;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.icon}>
          <Ionicons name="paper-plane" size={16} color={colors.accentInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Send your first song</Txt>
          <Txt variant="caption" color="text3">
            Pick anyone. It opens on whatever service they already use.
          </Txt>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.text3} />
        </TouchableOpacity>
      </View>
      <Button label="Choose someone" size="sm" onPress={() => { dismiss(); onSend(); }} style={s.action} />
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.accentSoft, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.accentBorder,
    padding: spacing.lg, gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  action: { alignSelf: 'flex-start' },
}));
