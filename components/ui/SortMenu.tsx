import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Sheet } from './Sheet';
import { Txt } from './Txt';

export interface SortOption<T extends string> {
  id: T;
  label: string;
}

export interface SortMenuProps<T extends string> {
  value: T;
  options: readonly SortOption<T>[];
  onChange: (id: T) => void;
  /** Sheet heading. */
  title?: string;
}

/**
 * A button that names the current sort and opens the alternatives.
 *
 * It replaced a rail of three pills. Pills spend a whole row saying what the
 * options are, which is the question nobody has — the useful information is
 * which one is active, and that is what this shows without the row.
 */
export function SortMenu<T extends string>({ value, options, onChange, title = 'Sort by' }: SortMenuProps<T>) {
  const s = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const current = options.find((option) => option.id === value);

  const choose = (id: T) => {
    setOpen(false);
    if (id !== value) onChange(id);
  };

  return (
    <>
      <TouchableOpacity
        style={s.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Sort by ${current?.label ?? value}. Change`}
        testID="sort-trigger"
      >
        <Txt variant="caption" color="text2">{current?.label ?? value}</Txt>
        <Ionicons name="chevron-down" size={13} color={colors.text3} />
      </TouchableOpacity>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title} maxHeight="50%">
        {options.map((option) => {
          const active = option.id === value;
          return (
            <TouchableOpacity
              key={option.id}
              style={s.option}
              onPress={() => choose(option.id)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              testID={`sort-option-${option.id}${active ? '-active' : ''}`}
            >
              <Txt variant="body" color={active ? 'accent' : 'text'}>{option.label}</Txt>
              {active ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
            </TouchableOpacity>
          );
        })}
      </Sheet>
    </>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    // 7 + 16 line height + 7 + 2 border = 32, the height of a Chip, so the
    // trigger sits level with the filter row rather than 2pt shy of it.
    paddingVertical: 7, paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
}));
