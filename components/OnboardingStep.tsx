import { KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../lib/theme';
import { Txt } from './ui';

export interface OnboardingStepProps {
  title: string;
  subtitle?: string;
  /** 1-based position, used for the progress dots. Omit to hide them. */
  step?: number;
  totalSteps?: number;
  onBack?: () => void;
  /** Rendered top-right, usually a Skip. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned above the keyboard, usually the primary button. */
  footer?: React.ReactNode;
}

/** One question per screen: title, supporting line, content, one action. */
export function OnboardingStep({
  title, subtitle, step, totalSteps, onBack, headerRight, children, footer,
}: OnboardingStepProps) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.header}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
          ) : <View style={s.headerSpacer} />}

          {step && totalSteps ? (
            <View style={s.dots} accessibilityLabel={`Step ${step} of ${totalSteps}`}>
              {Array.from({ length: totalSteps }).map((_, i) => (
                <View key={i} style={[s.dot, i < step && s.dotDone]} />
              ))}
            </View>
          ) : <View style={s.flex} />}

          {headerRight ?? <View style={s.headerSpacer} />}
        </View>

        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Txt variant="title1" style={s.title}>{title}</Txt>
          {subtitle ? <Txt variant="body" color="text3" style={s.subtitle}>{subtitle}</Txt> : null}
          {children}
        </ScrollView>

        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xl, height: 48, gap: spacing.md,
  },
  headerSpacer: { width: 24 },
  dots: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: spacing.xs + 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotDone: { backgroundColor: colors.accent },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.lg },
  footer: {
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
}));
