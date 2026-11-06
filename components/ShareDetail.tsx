/**
 * The shared frame of the song and playlist sheets, so the two read as one
 * family: a round close button, the art centred over a serif title, then
 * left-aligned sections on one gutter.
 */
import { View } from 'react-native';
import { makeStyles } from '../lib/theme';
import { CoverArt, IconBtn, Txt } from './ui';

export function DetailBar({ onClose, right }: { onClose: () => void; right?: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.bar}>
      <IconBtn name="chevron-down" label="Close" filled onPress={onClose} />
      {right}
    </View>
  );
}

export function DetailHero({ cover, title, subtitle }: { cover: string | null; title: string; subtitle: string | null }) {
  const s = useStyles();
  return (
    <View style={s.hero}>
      <View style={s.cover}>
        <CoverArt uri={cover} size={COVER} radius={8} />
      </View>
      <Txt variant="title1" align="center" style={s.title}>{title}</Txt>
      {subtitle ? <Txt variant="body" color="text3" align="center">{subtitle}</Txt> : null}
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: string; children?: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Txt variant="headline">{title}</Txt>
        {right ? <Txt variant="callout" color="text3">{right}</Txt> : null}
      </View>
      {children}
    </View>
  );
}

const COVER = 200;

const useStyles = makeStyles(({ colors, spacing, elevation }) => ({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  hero: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.xs },
  cover: { borderRadius: 8, backgroundColor: colors.surfaceAlt, marginBottom: spacing.xl, ...elevation.cover },
  title: { paddingHorizontal: spacing.lg },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
}));
