/**
 * The shared frame of the song and playlist sheets, so the two read as one
 * family: a round close button, the art centred over a serif title, then
 * left-aligned sections on one gutter.
 */
import { TouchableOpacity, View } from 'react-native';
import { makeStyles } from '../lib/theme';
import { timeAgo } from '../lib/utils';
import { SharedItem } from '../types';
import { Avatar, CoverArt, IconBtn, ServiceDot, Txt } from './ui';

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

/** Who shared it, when, and what they said. `children` sits under the note. */
export function FromSender({ item, onOpenProfile, children }: {
  item: SharedItem;
  onOpenProfile: (username: string) => void;
  children?: React.ReactNode;
}) {
  const s = useStyles();
  const sender = item.sender;
  if (!sender) return null;
  return (
    <Section title={item.recipient_id === null ? 'Dropped for everyone' : 'Shared with you'}>
      <TouchableOpacity
        style={s.senderRow}
        onPress={() => onOpenProfile(sender.username)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${sender.display_name}'s profile`}
      >
        <View>
          <Avatar name={sender.display_name} avatarUrl={sender.avatar_url} size={40} />
          {sender.primary_service ? (
            <View style={s.badge}><ServiceDot service={sender.primary_service} size={10} /></View>
          ) : null}
        </View>
        <View style={s.senderText}>
          <Txt variant="body" numberOfLines={1}>{sender.display_name}</Txt>
          <Txt variant="caption" color="text3" numberOfLines={1}>{`@${sender.username} · ${timeAgo(item.created_at)}`}</Txt>
        </View>
      </TouchableOpacity>
      {item.message ? (
        <View style={s.note}>
          <Txt variant="body" color="text2">{item.message}</Txt>
        </View>
      ) : null}
      {children}
    </Section>
  );
}

const COVER = 200;

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
  },
  hero: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.xs },
  cover: { borderRadius: 8, backgroundColor: colors.surfaceAlt, marginBottom: spacing.xl, ...elevation.cover },
  title: { paddingHorizontal: spacing.lg },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.md },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  senderText: { flex: 1, minWidth: 0, gap: 2 },
  badge: {
    position: 'absolute', right: -2, bottom: -2,
    padding: 2, borderRadius: 7, backgroundColor: colors.bg,
  },
  note: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
}));
