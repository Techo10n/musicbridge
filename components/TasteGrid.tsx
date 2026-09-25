import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../lib/theme';
import { CoverArt, EmptyState, Skeleton, Txt } from './ui';

export interface TasteCell {
  label: string;
  /** The answer, or null when we do not know it yet. */
  value: string | null;
  /** Art for the answer, when there is any. */
  coverUrl?: string | null;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

/**
 * Four facts about what someone listens to, with the art that goes with them.
 * The profile's job is to say who you are musically, and a grid of covers does
 * that faster than a column of statistics.
 */
export function TasteGrid({
  cells, loading, emptyAction,
}: {
  cells: TasteCell[];
  loading?: boolean;
  emptyAction?: { label: string; onPress: () => void };
}) {
  const s = useStyles();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={s.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={s.cell}>
            <Skeleton width="100%" height={92} radius={12} />
            <Skeleton width="55%" height={11} />
            <Skeleton width="80%" height={13} />
          </View>
        ))}
      </View>
    );
  }

  // Nothing known at all reads as broken unless it says why.
  if (cells.every((c) => !c.value)) {
    return (
      <EmptyState
        compact
        icon="disc-outline"
        title="Nothing to show yet"
        body="Connect a music service and your top artists and songs turn up here."
        action={emptyAction ? { ...emptyAction, icon: 'link-outline' } : undefined}
      />
    );
  }

  return (
    <View style={s.grid}>
      {cells.map((cell) => (
        <View key={cell.label} style={s.cell}>
          {cell.coverUrl ? (
            <CoverArt uri={cell.coverUrl} size={92} radius={12} style={s.art} />
          ) : (
            <View style={s.placeholder}>
              <Ionicons name={cell.icon ?? 'musical-note'} size={26} color={colors.text4} />
            </View>
          )}
          <Txt variant="micro" color="text3">{cell.label}</Txt>
          <Txt variant="bodyStrong" numberOfLines={2}>{cell.value ?? '—'}</Txt>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: spacing.lg, gap: spacing.md,
  },
  // Two per row, accounting for the gap between them.
  cell: { width: '47%', flexGrow: 1, gap: spacing.xs },
  art: { width: '100%' },
  placeholder: {
    width: '100%', height: 92, borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
}));
