/**
 * Shared UI primitives used across all screens.
 * These match the design system from MusicBridge.html.
 */
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { MusicService } from '../types';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// ─── ServiceDot ───────────────────────────────────────────────────────────────
const SVC_COLORS: Record<string, string> = {
  spotify: '#1DB954',
  apple_music: '#fc3c44',
  youtube_music: '#FF0000',
};

export function ServiceDot({ service, size = 8 }: { service: string; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: SVC_COLORS[service] ?? colors.fg3,
    }} />
  );
}

export function serviceLabelShort(service: MusicService | string): string {
  if (service === 'spotify') return 'Spotify';
  if (service === 'apple_music') return 'Apple Music';
  if (service === 'youtube_music') return 'YT Music';
  return service;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
interface AvatarProps {
  name?: string;
  avatarUrl?: string | null;
  size?: number;
  ring?: 'primary' | 'coral' | 'none';
}

export function Avatar({ name = '?', avatarUrl, size = 40, ring = 'none' }: AvatarProps) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const fontSize = size * 0.36;

  const inner = avatarUrl ? (
    <Image source={{ uri: avatarUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: colors.bgCard,
      borderWidth: 1, borderColor: colors.line,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: colors.fg2, fontSize, fontWeight: '700' }}>{initials}</Text>
    </View>
  );

  if (ring === 'none') return inner;

  const ringColor = ring === 'primary' ? colors.primary : colors.coral;
  return (
    <View style={{
      width: size + 6, height: size + 6, borderRadius: (size + 6) / 2,
      padding: 2, backgroundColor: ringColor,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <View style={{
        backgroundColor: colors.bg, borderRadius: (size + 2) / 2, padding: 1,
      }}>
        {inner}
      </View>
    </View>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────
export function Chip({
  label, active = false, color, onPress,
}: { label: string; active?: boolean; color?: string; onPress?: () => void }) {
  const C = onPress ? TouchableOpacity : View;
  return (
    <C
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, active && { backgroundColor: color ?? colors.primary, borderColor: color ?? colors.primary }]}
    >
      <Text style={[styles.chipText, active && { color: colors.primaryInk, fontWeight: '600' }]}>
        {label}
      </Text>
    </C>
  );
}

// ─── SectionTitle ─────────────────────────────────────────────────────────────
export function SectionTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitleText}>{title}</Text>
      {right}
    </View>
  );
}

// ─── AppBar ───────────────────────────────────────────────────────────────────
export function AppBar({
  logo, title, left, right, dense,
}: {
  logo?: boolean;
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  dense?: boolean;
}) {
  return (
    <View style={[styles.appBar, dense && styles.appBarDense]}>
      <View style={styles.appBarLeft}>
        {left}
        {logo && (
          <View style={styles.logoRow}>
            <View style={styles.logoMark}>
              <Text style={styles.logoMarkGlyph}>∿</Text>
            </View>
            <Text style={styles.logoText}>musicbridge</Text>
          </View>
        )}
        {title && <Text style={styles.appBarTitle}>{title}</Text>}
      </View>
      <View style={styles.appBarRight}>{right}</View>
    </View>
  );
}

// ─── IconBtn ──────────────────────────────────────────────────────────────────
export function IconBtn({ name, size = 22, onPress, badge }: { name: IoniconName; size?: number; onPress?: () => void; badge?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 4, position: 'relative' }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Ionicons name={name} size={size} color={colors.fg2} />
      {badge && (
        <View style={{
          position: 'absolute', top: 2, right: 2,
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: colors.coral, borderWidth: 2, borderColor: colors.bg,
        }} />
      )}
    </TouchableOpacity>
  );
}

// ─── PrimaryButton ────────────────────────────────────────────────────────────
export function PrimaryButton({ label, onPress, icon, loading, style }: {
  label: string; onPress?: () => void; icon?: IoniconName; loading?: boolean; style?: object;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, style]}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={loading}
    >
      {icon && <Ionicons name={icon} size={16} color={colors.primaryInk} />}
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── GhostButton ─────────────────────────────────────────────────────────────
export function GhostButton({ label, onPress, small }: { label: string; onPress?: () => void; small?: boolean }) {
  return (
    <TouchableOpacity
      style={[styles.ghostBtn, small && styles.ghostBtnSmall]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.ghostBtnText, small && styles.ghostBtnSmallText]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Cover art placeholder ────────────────────────────────────────────────────
export function CoverArt({ uri, size, radius = 10 }: { uri?: string | null; size: number; radius?: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.bgCard }} />;
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.line,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Ionicons name="musical-note" size={size * 0.35} color={colors.fg4} />
    </View>
  );
}

// ─── TasteBar ─────────────────────────────────────────────────────────────────
export function TasteBar({ pct }: { pct: number }) {
  const fill = pct > 85 ? colors.primary : pct > 70 ? colors.violet : colors.coral;
  return (
    <View style={styles.tasteBarTrack}>
      <View style={[styles.tasteBarFill, { width: `${pct}%` as any, backgroundColor: fill }]} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 999, backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.line,
  },
  chipText: { fontSize: 13, color: colors.fg2, fontWeight: '500' },
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 10, paddingTop: 4,
  },
  sectionTitleText: { fontSize: 17, fontWeight: '700', color: colors.fg, letterSpacing: -0.3 },
  appBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 10,
  },
  appBarDense: { paddingTop: 12, paddingBottom: 8 },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  appBarRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoMark: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoMarkGlyph: { color: colors.primaryInk, fontSize: 14, fontWeight: '700', lineHeight: 16 },
  logoText: { fontSize: 21, fontWeight: '800', color: colors.fg, letterSpacing: -0.6 },
  appBarTitle: { fontSize: 20, fontWeight: '700', color: colors.fg, letterSpacing: -0.3 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: 13, paddingHorizontal: 20,
  },
  primaryBtnText: { color: colors.primaryInk, fontSize: 15, fontWeight: '700' },
  ghostBtn: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 999,
    paddingVertical: 9, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ghostBtnSmall: { paddingVertical: 6, paddingHorizontal: 12 },
  ghostBtnText: { color: colors.fg, fontSize: 14, fontWeight: '600' },
  ghostBtnSmallText: { fontSize: 12 },
  tasteBarTrack: { flex: 1, maxWidth: 120, height: 4, borderRadius: 2, backgroundColor: colors.bgCard, overflow: 'hidden' },
  tasteBarFill: { height: '100%' },
});
