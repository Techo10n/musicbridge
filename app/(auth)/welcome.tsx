import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AUTH_CANCELLED, useAuth } from '../../hooks/useAuth';
import { enabledSocialProviders } from '../../lib/authProviders';
import { makeStyles, useTheme } from '../../lib/theme';
import { Button, Txt, Wordmark, useToast } from '../../components/ui';

export default function Welcome() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);

  const providers = enabledSocialProviders();

  const run = async (provider: 'apple' | 'google') => {
    setBusy(provider);
    try {
      await (provider === 'apple' ? signInWithApple() : signInWithGoogle());
      // The root layout takes over once the session lands.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      if (message !== AUTH_CANCELLED) toast.show({ kind: 'error', message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.hero}>
        <Wordmark size={44} />
        <Txt variant="body" color="text3" align="center" style={s.tagline}>
          Send a song to anyone. It opens on whatever they already use.
        </Txt>
      </View>

      <View style={s.actions}>
        {providers.includes('apple') ? (
          <TouchableOpacity
            style={[s.appleBtn, busy && s.btnBusy]}
            onPress={() => run('apple')}
            disabled={!!busy}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="logo-apple" size={19} color={colors.bg} />
            <Txt variant="bodyStrong" style={{ color: colors.bg }}>Continue with Apple</Txt>
          </TouchableOpacity>
        ) : null}

        {providers.includes('google') ? (
          <TouchableOpacity
            style={[s.googleBtn, busy && s.btnBusy]}
            onPress={() => run('google')}
            disabled={!!busy}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Ionicons name="logo-google" size={18} color={colors.text} />
            <Txt variant="bodyStrong">Continue with Google</Txt>
          </TouchableOpacity>
        ) : null}

        <Button
          label="Continue with email"
          variant={providers.length ? 'secondary' : 'primary'}
          fullWidth
          onPress={() => router.push('/(auth)/email')}
          disabled={!!busy}
        />

        <Txt variant="caption" color="text4" align="center" style={s.legal}>
          By continuing you agree to our Terms and Privacy Policy.
        </Txt>

        <TouchableOpacity onPress={() => router.push('/(auth)/login')} hitSlop={8} accessibilityRole="button">
          <Txt variant="caption" color="text3" align="center">Sign in with a password instead</Txt>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl, gap: spacing.md },
  tagline: { maxWidth: 300 },
  actions: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xl, gap: spacing.md },
  appleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    minHeight: 48, borderRadius: radius.pill, backgroundColor: colors.text,
  },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    minHeight: 48, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong,
  },
  btnBusy: { opacity: 0.5 },
  legal: { marginTop: spacing.xs, paddingHorizontal: spacing.md },
}));
