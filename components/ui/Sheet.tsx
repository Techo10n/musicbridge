import { KeyboardAvoidingView, Modal, Platform, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Txt } from './Txt';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Rendered right of the title, e.g. an action button. */
  headerRight?: React.ReactNode;
  /** Fraction of the screen the sheet may grow to. */
  maxHeight?: `${number}%`;
  children: React.ReactNode;
  testID?: string;
}

/**
 * Bottom sheet. Tapping the scrim or the close button dismisses it. Content
 * is expected to manage its own scrolling; the sheet only bounds height and
 * pads the home indicator.
 */
export function Sheet({ visible, onClose, title, headerRight, maxHeight = '86%', children, testID }: SheetProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root} testID={testID}>
        <TouchableOpacity style={s.scrim} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.avoid} pointerEvents="box-none">
          <View style={[s.sheet, { maxHeight, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={s.handle} />
            {title || headerRight ? (
              <View style={s.header}>
                <Txt variant="title2" style={s.title} numberOfLines={1}>{title ?? ''}</Txt>
                {headerRight}
                <TouchableOpacity onPress={onClose} hitSlop={12} style={s.close} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color={colors.text2} />
                </TouchableOpacity>
              </View>
            ) : null}
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: colors.overlay },
  // Needs a real height: `maxHeight` on the sheet is a percentage, and a
  // percentage resolves against its parent. With an auto-sized parent the cap
  // does not apply and tall content runs off the bottom of the screen.
  avoid: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bgElev,
    borderTopLeftRadius: radius.xl + 4,
    borderTopRightRadius: radius.xl + 4,
    paddingTop: spacing.sm,
    ...elevation.sheet,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.lineStrong,
    alignSelf: 'center', marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingBottom: spacing.md,
  },
  title: { flex: 1 },
  close: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
}));
