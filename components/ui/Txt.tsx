import { Text, TextProps } from 'react-native';
import { Palette, useTheme } from '../../lib/theme';

type Variant = keyof ReturnType<typeof useTheme>['type'];
type ColorKey = keyof Pick<Palette, 'text' | 'text2' | 'text3' | 'text4' | 'accent' | 'accentInk' | 'danger' | 'success'>;

export interface TxtProps extends TextProps {
  variant?: Variant;
  color?: ColorKey;
  align?: 'left' | 'center' | 'right';
}

/** Themed text. Defaults to body copy in the primary text color. */
export function Txt({ variant = 'body', color = 'text', align, style, ...rest }: TxtProps) {
  const { type, colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[type[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
