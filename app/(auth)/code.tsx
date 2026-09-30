import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { OnboardingStep } from '../../components/OnboardingStep';
import { Button, CodeInput, Txt, useToast } from '../../components/ui';
import { otpCodePhrase, otpLength } from '../../lib/authProviders';

export default function CodeStep() {
  const router = useRouter();
  const toast = useToast();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { verifyEmailCode, sendEmailCode } = useAuth();
  // Supabase's OTP length is per-project, so it cannot be hardcoded here.
  const codeLength = otpLength();

  const [code, setCode] = useState('');
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

  const resend = async () => {
    if (!email) return;
    try {
      await sendEmailCode(email);
      toast.show({ kind: 'success', message: `New code sent to ${email}` });
    } catch (err) {
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

      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <TouchableOpacity onPress={resend} hitSlop={10} accessibilityRole="button" disabled={verifying}>
          <Txt variant="caption" color="accent">Send it again</Txt>
        </TouchableOpacity>
      </View>
    </OnboardingStep>
  );
}
