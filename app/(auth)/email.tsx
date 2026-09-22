import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { OnboardingStep } from '../../components/OnboardingStep';
import { Button, Field, useToast } from '../../components/ui';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailStep() {
  const router = useRouter();
  const toast = useToast();
  const { sendEmailCode } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('That does not look like an email address');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await sendEmailCode(trimmed);
      router.push({ pathname: '/(auth)/code', params: { email: trimmed } });
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not send the code' });
    } finally {
      setSending(false);
    }
  };

  return (
    <OnboardingStep
      title="What's your email?"
      subtitle="We'll send you a six-digit code. No password to remember."
      onBack={() => router.back()}
      footer={<Button label="Send code" fullWidth loading={sending} onPress={submit} />}
    >
      <Field
        placeholder="you@example.com"
        value={email}
        onChangeText={(t) => { setEmail(t); if (error) setError(null); }}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        autoFocus
        editable={!sending}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
    </OnboardingStep>
  );
}
