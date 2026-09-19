import { forwardRef } from 'react';
import { StyleProp, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Txt } from './Txt';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  icon?: IoniconName;
  /** Rendered inside the field on the right, e.g. a spinner or a check. */
  trailing?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Text input with label, hint, error and optional leading icon. */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, error, icon, trailing, containerStyle, style, ...input },
  ref,
) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <View style={containerStyle}>
      {label ? <Txt variant="captionStrong" color="text3" style={s.label}>{label}</Txt> : null}
      <View style={[s.box, error ? s.boxError : null]}>
        {icon ? <Ionicons name={icon} size={18} color={colors.text3} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.text4}
          selectionColor={colors.accent}
          {...input}
          style={[s.input, style]}
        />
        {trailing}
      </View>
      {error ? (
        <Txt variant="caption" color="danger" style={s.help}>{error}</Txt>
      ) : hint ? (
        <Txt variant="caption" color="text3" style={s.help}>{hint}</Txt>
      ) : null}
    </View>
  );
});

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  label: { marginBottom: spacing.xs + 2 },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  boxError: { borderColor: colors.danger },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    ...type.body,
    color: colors.text,
  },
  help: { marginTop: spacing.xs + 2 },
}));
