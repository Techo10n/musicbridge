import { useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { makeStyles, useTheme } from '../../lib/theme';
import { Txt } from './Txt';

export interface CodeInputProps {
  value: string;
  onChange: (next: string) => void;
  /** Fired once the last digit is entered. */
  onComplete?: (code: string) => void;
  length?: number;
  autoFocus?: boolean;
  editable?: boolean;
  testID?: string;
}

/**
 * Six boxes backed by one hidden field. Tapping anywhere focuses the field, so
 * paste and the iOS one-time-code suggestion both work on the whole value
 * rather than per box.
 */
export function CodeInput({
  value, onChange, onComplete, length = 6, autoFocus, editable = true, testID,
}: CodeInputProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  const handleChange = (next: string) => {
    const digits = next.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Verification code" testID={testID}>
      <View style={s.row}>
        {Array.from({ length }).map((_, i) => {
          const char = value[i];
          const isCursor = editable && focused && i === value.length;
          return (
            <View key={i} style={[s.box, (char || isCursor) && s.boxActive]}>
              <Txt variant="title2">{char ?? ''}</Txt>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus={autoFocus}
        editable={editable}
        caretHidden
        selectionColor={colors.accent}
        style={s.hidden}
      />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  row: { flexDirection: 'row', gap: spacing.sm + 2, justifyContent: 'center' },
  box: {
    width: 46, height: 56, borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  boxActive: { borderColor: colors.accent, borderWidth: 2 },
  // Kept mounted and on-screen-but-invisible; display:none would drop focus.
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
}));
