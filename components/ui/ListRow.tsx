import { StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';
import { makeStyles } from '../../lib/theme';
import { Txt } from './Txt';

export interface ListRowProps {
  leading?: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Rendered under the subtitle, e.g. a taste bar. */
  extra?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  separator?: boolean;
  /** Inset the separator so it starts after the leading element. */
  inset?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The standard list row: leading art or avatar, two lines, trailing action. */
export function ListRow({
  leading, title, subtitle, extra, trailing, onPress, separator, inset = true, disabled, style, testID,
}: ListRowProps) {
  const s = useStyles();
  const Container = onPress ? TouchableOpacity : View;
  return (
    <Container
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.75}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[s.row, style]}
    >
      {leading}
      <View style={s.body}>
        <Txt variant="bodyStrong" numberOfLines={1}>{title}</Txt>
        {subtitle ? <Txt variant="caption" color="text3" numberOfLines={1} style={s.subtitle}>{subtitle}</Txt> : null}
        {extra}
      </View>
      {trailing}
      {separator ? <View style={[s.sep, inset && leading ? s.sepInset : null]} /> : null}
    </Container>
  );
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    position: 'relative',
  },
  body: { flex: 1, minWidth: 0 },
  subtitle: { marginTop: 2 },
  sep: { position: 'absolute', left: spacing.lg, right: 0, bottom: 0, height: 1, backgroundColor: colors.line },
  sepInset: { left: spacing.lg + 48 + spacing.md },
}));
