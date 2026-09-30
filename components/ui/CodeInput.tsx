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
 * One box per character, backed by a single hidden field. Tapping anywhere
 * focuses that field, so paste and the iOS one-time-code suggestion both act on
 * the whole value rather than per box.
 *
 * The boxes share the available width instead of each being a fixed 46pt.
 * Supabase's OTP length is configurable up to ten, and ten fixed boxes ran off
 * the side of the screen with no way to see or submit the last of them.
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
      <View style={[s.row, length > 6 && s.rowTight]}>
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
  // Longer codes trade gap for box width rather than overflowing the screen.
  rowTight: { gap: spacing.xs + 2 },
  box: {
    // Shares the row rather than claiming a fixed width, so a longer code still
    // fits. maxWidth keeps a six-digit code looking as it always has.
    flex: 1, maxWidth: 46, minWidth: 0, height: 56, borderRadius: radius.md,
    backgroundColor: colors.surface,
    // The width never changes with focus: the boxes now share the row, so
    // thickening one border would reflow every box beside it.
    borderWidth: 2, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  boxActive: { borderColor: colors.accent },
  // Kept mounted and on-screen-but-invisible; display:none would drop focus.
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
}));
