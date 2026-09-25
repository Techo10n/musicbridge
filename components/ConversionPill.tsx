import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { activeConversion, useConversions } from '../hooks/useConversions';
import { makeStyles, useTheme } from '../lib/theme';
import { Txt } from './ui';

/**
 * Sits above the tab bar while a conversion runs, so leaving the playlist
 * screen does not make a minutes-long job look like it stopped.
 */
export function ConversionPill() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { conversions } = useConversions();

  const run = activeConversion(conversions);
  if (!run) return null;

  const pct = run.total ? Math.round((run.processed / run.total) * 100) : 0;

  return (
    <View style={s.wrap} pointerEvents="box-none">
      <TouchableOpacity
        style={s.pill}
        onPress={() => router.push(`/playlist/${run.itemId}`)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`Converting ${run.title}, ${run.processed} of ${run.total}`}
      >
        <Ionicons name="sync" size={15} color={colors.accentInk} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="captionStrong" style={{ color: colors.accentInk }} numberOfLines={1}>
            {`Adding ${run.title}`}
          </Txt>
          <Txt variant="caption" style={{ color: colors.accentInk, opacity: 0.8 }}>
            {`${run.processed} of ${run.total}`}
          </Txt>
        </View>
        <Txt variant="captionStrong" style={{ color: colors.accentInk }}>{`${pct}%`}</Txt>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
  // Clears the tab bar, which is 80 tall with its own bottom padding.
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: 92 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    ...elevation.toast,
  },
}));
