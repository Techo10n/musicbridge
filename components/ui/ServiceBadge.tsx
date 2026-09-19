import { View } from 'react-native';
import { makeStyles, serviceColor, useTheme } from '../../lib/theme';
import { serviceLabel, serviceLabelShort } from '../../lib/services';
import { MusicService } from '../../types';
import { Txt } from './Txt';

/** A brand-colored dot. Use where only the service identity matters. */
export function ServiceDot({ service, size = 8 }: { service: MusicService | string | null | undefined; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityLabel={serviceLabel(service)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: serviceColor(colors, service) }}
    />
  );
}

/** Dot + name in a chip. `suffix` adds a muted tag, e.g. "Yours". */
export function ServiceChip({ service, short, suffix }: { service: MusicService | string; short?: boolean; suffix?: string }) {
  const s = useStyles();
  return (
    <View style={s.chip}>
      <ServiceDot service={service} />
      <Txt variant="captionStrong" color="text2">{short ? serviceLabelShort(service) : serviceLabel(service)}</Txt>
      {suffix ? <Txt variant="captionStrong" color="accent">{suffix}</Txt> : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceAlt, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 1,
  },
}));
