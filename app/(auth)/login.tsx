import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { makeStyles } from '../../lib/theme';
import { Button, Field, Txt, Wordmark } from '../../components/ui';

export default function Login() {
  const s = useStyles();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // Auth state change in useAuth triggers redirect via _layout.tsx
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.inner}>
        <Wordmark size={40} />
        <Txt variant="callout" color="text3" align="center" style={s.subtitle}>
          Share music across any streaming service
        </Txt>

        <Field
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!loading}
          containerStyle={s.field}
        />
        <Field
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          editable={!loading}
          error={error}
          containerStyle={s.field}
          onSubmitEditing={handleLogin}
          returnKeyType="go"
        />

        <Button label="Sign in" onPress={handleLogin} loading={loading} fullWidth style={s.button} />

        <Link href="/(auth)/register" asChild>
          <Txt variant="callout" color="text3" align="center" style={s.link}>
            Don&apos;t have an account? <Txt variant="callout" color="accent">Sign up</Txt>
          </Txt>
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors, spacing }) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl },
  subtitle: { marginTop: spacing.sm, marginBottom: spacing.xxxl + spacing.lg },
  field: { alignSelf: 'stretch', marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  link: { marginTop: spacing.xxl, paddingVertical: spacing.sm },
}));
