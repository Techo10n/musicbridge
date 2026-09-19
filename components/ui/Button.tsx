import { ActivityIndicator, StyleProp, TouchableOpacity, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Txt } from './Txt';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
  icon?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Button({
  label, onPress, variant = 'primary', size = 'md', icon, loading, disabled, fullWidth, style, testID,
}: ButtonProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const inactive = !!disabled || !!loading;
  const fg =
    variant === 'primary' ? colors.accentInk
    : variant === 'danger' ? colors.danger
    : colors.text;

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.8}
      style={[
        s.base,
        s[variant],
        size === 'sm' && s.sm,
        fullWidth && s.fullWidth,
        disabled && s.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <View style={s.content}>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 14 : 17} color={fg} /> : null}
          <Txt
            variant={size === 'sm' ? 'captionStrong' : 'bodyStrong'}
            style={{ color: fg }}
            numberOfLines={1}
          >
            {label}
          </Txt>
        </View>
      )}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sm: { minHeight: 34, paddingHorizontal: spacing.lg },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.dangerSoft },
  disabled: { opacity: 0.45 },
}));
