import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { Txt } from './Txt';

export interface ToastOptions {
  message: string;
  kind?: 'default' | 'success' | 'error';
  action?: { label: string; onPress: () => void };
  /** Milliseconds before auto-dismiss. Defaults to 3200, or 5000 with an action. */
  duration?: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {}, hide: () => {} });

/** Bottom offset so toasts clear the tab bar. Screens without one can pass 0. */
export const TAB_BAR_CLEARANCE = 84;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<(ToastOptions & { id: number }) | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setCurrent(null);
  }, []);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    seq.current += 1;
    setCurrent({ ...options, id: seq.current });
    const duration = options.duration ?? (options.action ? 5000 : 3200);
    timer.current = setTimeout(() => { timer.current = null; setCurrent(null); }, duration);
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {current ? <ToastView key={current.id} toast={current} onDismiss={hide} /> : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

function ToastView({ toast, onDismiss }: { toast: ToastOptions; onDismiss: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [progress]);

  const iconName = toast.kind === 'success' ? 'checkmark-circle' : toast.kind === 'error' ? 'alert-circle' : null;
  const iconColor = toast.kind === 'error' ? colors.danger : colors.success;

  return (
    <Animated.View
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
      style={[
        s.wrap,
        { bottom: insets.bottom + TAB_BAR_CLEARANCE },
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <View style={s.toast} testID="toast">
        {iconName ? <Ionicons name={iconName} size={18} color={iconColor} /> : null}
        <Txt variant="callout" style={s.message} numberOfLines={2}>{toast.message}</Txt>
        {toast.action ? (
          <TouchableOpacity
            onPress={() => { toast.action?.onPress(); onDismiss(); }}
            hitSlop={10}
            accessibilityRole="button"
          >
            <Txt variant="bodyStrong" style={s.action}>{toast.action.label}</Txt>
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, elevation }) => ({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2,
    backgroundColor: colors.toastBg,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg,
    ...elevation.toast,
  },
  message: { flex: 1, color: colors.toastText },
  action: { color: colors.toastAction },
}));
