import { useCallback, useEffect, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, TouchableOpacity, View } from 'react-native';
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

const IN_MS = 260;
const OUT_MS = 190;

/**
 * Bottom sheet. Tapping the scrim or the close button dismisses it. Content
 * is expected to manage its own scrolling; the sheet only bounds height and
 * pads the home indicator.
 *
 * The animation is done here rather than with Modal's `animationType="slide"`,
 * because that slides the entire modal — scrim included — so the dimming
 * travelled up from the bottom of the screen with the sheet. The scrim should
 * fade in place while only the panel moves.
 */
export function Sheet({ visible, onClose, title, headerRight, maxHeight = '86%', children, testID }: SheetProps) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // useState, not useRef: the React Compiler lint rules forbid reading a ref
  // during render, and this value is interpolated in the returned JSX. The
  // lazy initializer still constructs it exactly once. Same pattern as Skeleton.
  const [progress] = useState(() => new Animated.Value(0));
  // Measured so the panel starts exactly its own height below the fold. A fixed
  // offset would make a short sheet travel further than it is tall, which reads
  // as a flick rather than a slide.
  const [panelHeight, setPanelHeight] = useState(0);

  /**
   * The sheet outlives `visible` by one animation so the exit has something
   * left to animate. Without it a parent that closes by flipping its own state
   * — picking an option, finishing a send — would make the panel vanish on the
   * frame of the tap.
   *
   * Derived during render rather than in an effect: React supports adjusting
   * state while rendering for exactly this "something changed since last
   * render" case, and doing it in an effect would fire a cascading render that
   * the compiler lint rejects.
   */
  const [exiting, setExiting] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) setExiting(true);
  }

  useEffect(() => {
    if (visible) {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: IN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }

    if (!exiting) return;
    let cancelled = false;
    Animated.timing(progress, {
      toValue: 0,
      duration: OUT_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !cancelled) setExiting(false);
    });
    return () => { cancelled = true; };
  }, [visible, exiting, progress]);

  // The exit itself is driven by the effect above once `visible` goes false.
  const requestClose = useCallback(() => { onClose(); }, [onClose]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [panelHeight || 360, 0],
  });

  return (
    <Modal visible={visible || exiting} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <View style={s.root} testID={testID}>
        <Animated.View style={[s.scrim, { opacity: progress }]}>
          <TouchableOpacity style={s.scrimFill} activeOpacity={1} onPress={requestClose} accessibilityLabel="Close" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.avoid} pointerEvents="box-none">
          <Animated.View
            onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
            style={[s.sheet, { maxHeight, paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY }] }]}
          >
            <View style={s.handle} />
            {title || headerRight ? (
              <View style={s.header}>
                <Txt variant="title2" style={s.title} numberOfLines={1}>{title ?? ''}</Txt>
                {headerRight}
                <TouchableOpacity onPress={requestClose} hitSlop={12} style={s.close} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color={colors.text2} />
                </TouchableOpacity>
              </View>
            ) : null}
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
  root: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const), backgroundColor: colors.overlay },
  scrimFill: { flex: 1 },
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
