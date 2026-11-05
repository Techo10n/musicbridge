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
}

/**
 * One button carrying your reaction and the total. Tapping it floats a picker
 * above it; the button stays put, so tapping it again closes the picker
 * without reacting. A permanent row of four would compete with the card's
 * one real action.
 */
export function ReactionBar({ counts, mine, onReact }: ReactionBarProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const pick = (emoji: string) => {
    setOpen(false);
    onReact(emoji);
  };

  return (
    <View>
      {open ? (
        <View style={s.picker} testID="reaction-picker">
          {REACTIONS.map((emoji) => {
            const count = counts[emoji] ?? 0;
            return (
              <TouchableOpacity
                key={emoji}
                style={[s.option, mine === emoji && s.optionMine]}
                onPress={() => pick(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
              >
                <Txt variant="headline">{emoji}</Txt>
                {count > 0 ? <Txt variant="caption" color="text3" style={s.optionCount}>{String(count)}</Txt> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <TouchableOpacity
        style={[s.toggle, (open || mine) && s.toggleActive]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Close reactions' : mine ? `Your reaction ${mine}. Change it` : 'Add a reaction'}
        testID="reaction-toggle"
      >
        {mine
          ? <Txt variant="callout">{mine}</Txt>
          : <Ionicons name="happy-outline" size={16} color={open ? colors.accent : colors.text3} />}
        {total > 0 ? <Txt variant="caption" color="text3">{String(total)}</Txt> : null}
      </TouchableOpacity>
    </View>
  );
}

/**
 * Fixed option width, so the picker's width is known. An absolutely placed
 * view is otherwise capped at its parent's width, which is the small button.
 */
const OPTION = 44;

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
  toggle: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3,
    paddingHorizontal: spacing.sm + 2, height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  toggleActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  // Floats above the button rather than replacing it, so it reads as a
  // separate layer that came from the button.
  picker: {
    position: 'absolute', left: 0, bottom: 32 + spacing.sm, zIndex: 1,
    width: REACTIONS.length * OPTION + spacing.xs * 2 + 2,
    flexDirection: 'row', padding: spacing.xs,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: colors.line,
    ...elevation.toast,
  },
  option: {
    width: OPTION, height: OPTION - 4, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
  },
  optionCount: { position: 'absolute', right: 3, bottom: 1, fontSize: 10, lineHeight: 12 },
  optionMine: { backgroundColor: colors.accentSoft },
}));
