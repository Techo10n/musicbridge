import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../lib/theme';
import { Txt } from './ui';

/** The four reactions, in one place rather than once per screen. */
export const REACTIONS = ['🔥', '❤️', '🤯', '😮'] as const;

export interface ReactionBarProps {
  counts: Record<string, number>;
  /** The viewer's own reaction, if they have one. */
  mine: string | undefined;
  onReact: (emoji: string) => void;
  /**
   * Collapsed shows a single button that expands on tap. The feed uses it
   * because a permanent row of four competed with the card's one real action;
   * the song screen has the room to show them all.
   */
  collapsed?: boolean;
}

export function ReactionBar({ counts, mine, onReact, collapsed }: ReactionBarProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const pick = (emoji: string) => {
    setOpen(false);
    onReact(emoji);
  };

  if (collapsed && !open) {
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    return (
      <TouchableOpacity
        style={[s.reaction, mine ? s.reactionMine : null]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={mine ? `Your reaction ${mine}. Change it` : 'Add a reaction'}
        testID="reaction-toggle"
      >
        {mine
          ? <Txt variant="callout">{mine}</Txt>
          : <Ionicons name="happy-outline" size={16} color={colors.text3} />}
        {total > 0 ? <Txt variant="caption" color="text3">{String(total)}</Txt> : null}
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.row}>
      {REACTIONS.map((emoji) => {
        const count = counts[emoji] ?? 0;
        return (
          <TouchableOpacity
            key={emoji}
            style={[s.reaction, mine === emoji && s.reactionMine]}
            onPress={() => pick(emoji)}
            accessibilityRole="button"
            accessibilityLabel={`React ${emoji}`}
          >
            <Txt variant="callout">{emoji}</Txt>
            {count > 0 ? <Txt variant="caption" color="text3">{String(count)}</Txt> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  row: { flexDirection: 'row', gap: spacing.xs + 2, alignItems: 'center' },
  reaction: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: spacing.sm, height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  reactionMine: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
}));
