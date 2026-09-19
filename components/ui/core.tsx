/**
 * Small building blocks shared by every screen: avatars, chips, app bar,
 * icon buttons, cover art, and the taste-match bar.
 */
import { Image, ImageStyle, StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Txt } from './Txt';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── Avatar ───────────────────────────────────────────────────────────────────
export interface AvatarProps {
  name?: string;
  avatarUrl?: string | null;
  size?: number;
  ring?: 'accent' | 'none';
}

export function initialsFor(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

export function Avatar({ name = '?', avatarUrl, size = 40, ring = 'none' }: AvatarProps) {
  const { colors } = useTheme();
  const inner = avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceAlt }} accessibilityLabel={name} />
  ) : (
    <View
      accessibilityLabel={name}
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: colors.surfaceAlt,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Txt variant="bodyStrong" color="text2" style={{ fontSize: size * 0.36, lineHeight: size * 0.44 }}>{initialsFor(name)}</Txt>
    </View>
  );

  if (ring === 'none') return inner;
  return (
    <View style={{ padding: 2, borderRadius: (size + 8) / 2, borderWidth: 2, borderColor: colors.accent }}>
      {inner}
    </View>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
export function Chip({
  label, active = false, onPress, icon,
}: { label: string; active?: boolean; onPress?: () => void; icon?: IoniconName }) {
  const s = useStyles();
  const { colors } = useTheme();
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected: active }}
      style={[s.chip, active && s.chipActive]}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? colors.bg : colors.text2} /> : null}
      <Txt variant="captionStrong" style={active ? s.chipTextActive : s.chipText}>{label}</Txt>
    </Container>
  );
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────
export function SectionTitle({ title, right, style }: { title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const s = useStyles();
  return (
    <View style={[s.sectionTitleRow, style]}>
      <Txt variant="headline">{title}</Txt>
      {right}
    </View>
  );
}

// ─── Wordmark ─────────────────────────────────────────────────────────────────
export function Wordmark({ size = 24 }: { size?: number }) {
  const { fonts, colors } = useTheme();
  return (
    <Txt
      accessibilityRole="header"
      style={{ fontFamily: fonts.displayBold, fontSize: size, lineHeight: size * 1.15, letterSpacing: -size * 0.03, color: colors.text }}
    >
      museaic
    </Txt>
  );
}

// ─── AppBar ───────────────────────────────────────────────────────────────────
export function AppBar({
  logo, title, left, right, onBack,
}: {
  logo?: boolean;
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onBack?: () => void;
}) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={s.appBar}>
      <View style={s.appBarSide}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityLabel="Back" accessibilityRole="button" style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        {left}
        {logo ? <Wordmark /> : null}
        {title ? <Txt variant="title2" numberOfLines={1}>{title}</Txt> : null}
      </View>
      <View style={s.appBarRight}>{right}</View>
    </View>
  );
}

// ─── IconBtn ──────────────────────────────────────────────────────────────────
export function IconBtn({
  name, size = 22, onPress, badge, label, filled,
}: { name: IoniconName; size?: number; onPress: () => void; badge?: boolean; label: string; filled?: boolean }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.iconBtn, filled && s.iconBtnFilled]}
    >
      <Ionicons name={name} size={size} color={colors.text} />
      {badge ? <View style={s.badge} /> : null}
    </TouchableOpacity>
  );
}

// ─── CoverArt ─────────────────────────────────────────────────────────────────
export function CoverArt({ uri, size, radius, style }: { uri?: string | null; size: number; radius?: number; style?: StyleProp<ImageStyle> }) {
  const { colors, radius: r } = useTheme();
  const rad = radius ?? r.sm;
  if (uri) {
    return <Image source={{ uri }} style={[{ width: size, height: size, borderRadius: rad, backgroundColor: colors.surfaceAlt }, style]} />;
  }
  return (
    <View style={[{
      width: size, height: size, borderRadius: rad,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center', justifyContent: 'center',
    }, style]}>
      <Ionicons name="musical-note" size={size * 0.35} color={colors.text4} />
    </View>
  );
}

// ─── TasteBar ─────────────────────────────────────────────────────────────────
export function TasteBar({ pct }: { pct: number }) {
  const s = useStyles();
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  const fill = clamped > 70 ? colors.accent : clamped > 40 ? colors.warning : colors.text4;
  return (
    <View style={s.tasteBarTrack}>
      <View style={[s.tasteBarFill, { width: `${clamped}%`, backgroundColor: fill }]} />
    </View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2,
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.surfaceAlt,
  },
  chipActive: { backgroundColor: colors.text },
  chipText: { color: colors.text2 },
  chipTextActive: { color: colors.bg },
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingBottom: spacing.sm + 2, paddingTop: spacing.xs,
  },
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm + 2, gap: spacing.sm + 2,
    minHeight: 56,
  },
  appBarSide: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, flex: 1, minWidth: 0 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  backBtn: { marginLeft: -6, padding: 2 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconBtnFilled: { backgroundColor: colors.surfaceAlt },
  badge: {
    position: 'absolute', top: 7, right: 7,
    width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.danger, borderWidth: 2, borderColor: colors.bg,
  },
  tasteBarTrack: { flex: 1, maxWidth: 120, height: 4, borderRadius: 2, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  tasteBarFill: { height: '100%' },
}));
