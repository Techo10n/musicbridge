import { View } from 'react-native';
import { EmojiPopup } from 'react-native-emoji-popup';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../lib/theme';
import { Txt } from './ui';

export interface ReactionBarProps {
  counts: Record<string, number>;
  /** The viewer's own reaction, if they have one. */
  mine: string | undefined;
  onReact: (emoji: string) => void;
}

/**
 * One button showing how a share landed: its top reactions and the total.
 * Tapping it opens the system emoji picker, so any emoji is a reaction.
 * Picking your current one again removes it (see useReactions).
 */
export function ReactionBar({ counts, mine, onReact }: ReactionBarProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const top = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([emoji]) => emoji)
    .join('');

  return (
    // The native view owns the tap; a touchable inside it would swallow it.
    <View style={s.wrap}>
      <EmojiPopup onEmojiSelected={onReact}>
        <View
          style={[s.button, mine && s.buttonMine]}
          accessible
          accessibilityRole="button"
          accessibilityLabel={mine ? `Your reaction ${mine}. Change it` : 'Add a reaction'}
        >
          {top
            ? <Txt variant="callout">{top}</Txt>
            : <Ionicons name="happy-outline" size={16} color={colors.text3} />}
          {total > 0 ? <Txt variant="caption" color="text3">{String(total)}</Txt> : null}
        </View>
      </EmojiPopup>
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  wrap: { alignSelf: 'flex-start' },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    minWidth: 34, height: 34, paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  buttonMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
}));
