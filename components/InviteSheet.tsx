import { Share, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../lib/theme';
import { Sheet, Txt, useToast } from './ui';

/** The link on someone's profile: what Share sends and Copy puts on the clipboard. */
export function profileLink(username: string): string {
  return `https://museaic.app/@${username}`;
}

export interface InviteSheetProps {
  visible: boolean;
  onClose: () => void;
  username: string | undefined;
}

/**
 * How someone gets their first friend. Sharing needs two people, and a new
 * account has nobody, so this is the one thing the People tab has to make easy.
 */
export function InviteSheet({ visible, onClose, username }: InviteSheetProps) {
  const s = useStyles();
  const toast = useToast();

  const link = username ? profileLink(username) : '';

  const share = async () => {
    if (!link) return;
    try {
      await Share.share({
        message: `Add me on Museaic — I'm @${username}. It sends songs across Spotify, Apple Music and YouTube Music: ${link}`,
      });
    } catch {
      toast.show({ kind: 'error', message: 'Could not open the share sheet' });
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link);
      toast.show({ kind: 'success', message: 'Link copied' });
    } catch {
      toast.show({ kind: 'error', message: 'Could not copy the link' });
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add a friend">
      <View style={s.body}>
        <View style={s.linkCard}>
          <Txt variant="micro" color="text3">Your link</Txt>
          <Txt variant="bodyStrong" numberOfLines={1}>{link || 'Set a username first'}</Txt>
        </View>

        <Action icon="share-outline" label="Share it" hint="Messages, mail, anywhere" onPress={share} disabled={!link} />
        <Action icon="copy-outline" label="Copy link" hint={link} onPress={copy} disabled={!link} />
      </View>
    </Sheet>
  );
}

function Action({
  icon, label, hint, onPress, disabled,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[s.action, disabled && s.actionOff]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={s.actionIcon}>
        <Ionicons name={icon} size={19} color={colors.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="bodyStrong">{label}</Txt>
        <Txt variant="caption" color="text3" numberOfLines={1}>{hint}</Txt>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.text3} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  linkCard: {
    backgroundColor: colors.surfaceAlt, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 2,
  },
  action: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2,
  },
  actionOff: { opacity: 0.5 },
  actionIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
}));
