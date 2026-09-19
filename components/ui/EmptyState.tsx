import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Button } from './Button';
import { Txt } from './Txt';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface EmptyStateProps {
  icon?: IoniconName;
  /** Rendered instead of the icon when supplied, e.g. an illustration. */
  art?: React.ReactNode;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IoniconName };
  secondaryAction?: { label: string; onPress: () => void };
  /** Compact spacing for inline use inside a section. */
  compact?: boolean;
  testID?: string;
}

/** The one empty state. Always a title; usually one clear thing to do next. */
export function EmptyState({ icon, art, title, body, action, secondaryAction, compact, testID }: EmptyStateProps) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[s.root, compact && s.compact]} testID={testID}>
      {art ?? (icon ? (
        <View style={s.iconWrap}>
          <Ionicons name={icon} size={26} color={colors.accent} />
        </View>
      ) : null)}
      <Txt variant={compact ? 'headline' : 'title2'} align="center">{title}</Txt>
      {body ? <Txt variant="callout" color="text3" align="center" style={s.body}>{body}</Txt> : null}
      {action ? (
        <Button label={action.label} icon={action.icon} onPress={action.onPress} style={s.action} />
      ) : null}
      {secondaryAction ? (
        <Button label={secondaryAction.label} onPress={secondaryAction.onPress} variant="ghost" size="sm" />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  root: { alignItems: 'center', paddingVertical: spacing.xxxl * 2, paddingHorizontal: spacing.xxxl, gap: spacing.sm },
  compact: { paddingVertical: spacing.xxl },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  body: { maxWidth: 300 },
  action: { marginTop: spacing.md },
}));
