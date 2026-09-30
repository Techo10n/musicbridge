import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { OnboardingStep } from '../../components/OnboardingStep';
import { Button, CodeInput, Txt, useToast } from '../../components/ui';
import { makeStyles, useTheme } from '../../lib/theme';
import { otpCodePhrase, otpLength } from '../../lib/authProviders';

export default function CodeStep() {
  const router = useRouter();
  const toast = useToast();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmailCode, sendEmailCode } = useAuth();
  // Supabase's OTP length is per-project, so it cannot be hardcoded here.
  const codeLength = otpLength();

  const s = useStyles();
  const { colors } = useTheme();

  const [code, setCode] = useState('');
  /**
   * The resend control is its own small state machine rather than a toast.
   * A toast slides in over the keyboard and is gone before someone who just
   * looked away can read it; replacing the control answers "did that work?"
   * in the place they were already looking.
   */
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (value: string = code) => {
    if (value.length < codeLength || !email) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyEmailCode(email, value);
      // The root layout routes onward once the session lands.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not work');
      setCode('');
    } finally {
      setVerifying(false);
    }
  };

  // Back to offering after a few seconds: a code can go astray, and a
  // confirmation that never clears would strand someone with no way to retry.
  useEffect(() => {
    if (resend !== 'sent') return;
    const timer = setTimeout(() => setResend('idle'), 5000);
    return () => clearTimeout(timer);
  }, [resend]);

  const resendCode = async () => {
    if (!email || resend !== 'idle') return;
    setResend('sending');
    try {
      await sendEmailCode(email);
      setResend('sent');
    } catch (err) {
      // Straight back to idle. Saying a code was sent when it was not is worse
      // than the error, because the user would sit waiting for it.
      setResend('idle');
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not resend the code' });
    }
  };

  return (
    <OnboardingStep
      title="Check your email"
      subtitle={`We sent ${otpCodePhrase()} to ${email ?? 'your inbox'}.`}
      onBack={() => router.back()}
      footer={
        <Button label="Continue" fullWidth loading={verifying} disabled={code.length < codeLength} onPress={() => submit()} />
      }
    >
      <CodeInput value={code} onChange={setCode} onComplete={submit} length={codeLength} autoFocus editable={!verifying} />

      {error ? <Txt variant="caption" color="danger" align="center">{error}</Txt> : null}

      <View style={s.resendRow} accessibilityLiveRegion="polite">
        {resend === 'sent' ? (
          <View style={s.sentRow}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Txt variant="caption" style={{ color: colors.success }}>New code sent</Txt>
          </View>
        ) : resend === 'sending' ? (
          <Txt variant="caption" color="text3">Sending…</Txt>
        ) : (
          <TouchableOpacity onPress={resendCode} hitSlop={10} accessibilityRole="button" disabled={verifying}>
            <Txt variant="caption" color="accent">Send it again</Txt>
          </TouchableOpacity>
        )}
      </View>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(({ spacing }) => ({
  // A fixed height so swapping the control does not nudge the layout.
  resendRow: { alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm, height: 20 },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
}));
