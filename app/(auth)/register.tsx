import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { SERVICES, serviceLabel } from '../../lib/services';
import { makeStyles } from '../../lib/theme';
import { MusicService } from '../../types';
import { Button, Field, ServiceDot, Txt, Wordmark } from '../../components/ui';

type Step = 'credentials' | 'service';

const SERVICE_BLURB: Record<MusicService, string> = {
  spotify: 'Playlists, liked songs, and Blend',
  apple_music: 'Your library via MusicKit',
  youtube_music: 'Liked music and playlists via Google',
};

export default function Register() {
  const s = useStyles();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signUp, session, setPrimaryService, refreshUser } = useAuth();
  const router = useRouter();

  const connectSelectedService = async (userId: string, service: MusicService): Promise<boolean> => {
    switch (service) {
      case 'spotify': return Spotify.connectSpotify(userId);
      case 'apple_music': return AppleMusic.connectAppleMusic(userId);
      case 'youtube_music': return YouTubeMusic.connectYouTubeMusic(userId);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password || !username.trim() || !displayName.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (username.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }

    setLoading(true);
    setError(null);
    try {
      await signUp(email.trim().toLowerCase(), password, username.trim().toLowerCase(), displayName.trim());
      setStep('service');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceSelect = async (service: MusicService) => {
    setLoading(true);
    setError(null);
    try {
      await setPrimaryService(service);
      setLoading(false);

      const userId = session?.user.id;
      if (!userId) { router.replace('/(tabs)/home'); return; }

      Alert.alert(
        `Connect ${serviceLabel(service)}?`,
        'Connecting now lets Museaic open songs and create playlists on your service right away.',
        [
          { text: 'Later', style: 'cancel', onPress: () => router.replace('/(tabs)/home') },
          {
            text: 'Connect now',
            onPress: () => {
              setLoading(true);
              void (async () => {
                try {
                  const success = await connectSelectedService(userId, service);
                  if (success) {
                    await refreshUser();
                    router.replace('/(tabs)/home');
                    return;
                  }
                  setError(`Could not connect ${serviceLabel(service)}. You can connect it later from Settings.`);
                  setLoading(false);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Connection failed');
                  setLoading(false);
                }
              })();
            },
          },
        ],
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service selection');
      setLoading(false);
    }
  };

  if (step === 'service') {
    return (
      <View style={s.container}>
        <View style={s.inner}>
          <Wordmark size={32} />
          <Txt variant="title1" align="center" style={s.stepTitle}>Where do you listen?</Txt>
          <Txt variant="callout" color="text3" align="center" style={s.stepSubtitle}>
            This is where shared songs open for you. You can still send to friends on any service.
          </Txt>

          {error ? <Txt variant="callout" color="danger" align="center" style={s.error}>{error}</Txt> : null}

          {SERVICES.map((svc) => (
            <TouchableOpacity
              key={svc}
              style={s.serviceCard}
              onPress={() => handleServiceSelect(svc)}
              disabled={loading}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <ServiceDot service={svc} size={14} />
              <View style={{ flex: 1 }}>
                <Txt variant="bodyStrong">{serviceLabel(svc)}</Txt>
                <Txt variant="caption" color="text3">{SERVICE_BLURB[svc]}</Txt>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Wordmark size={32} />
        <Txt variant="title1" align="center" style={s.stepTitle}>Create your account</Txt>

        <Field placeholder="Display name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" editable={!loading} containerStyle={s.field} />
        <Field
          placeholder="Username"
          value={username}
          onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
          containerStyle={s.field}
        />
        <Field placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" editable={!loading} containerStyle={s.field} />
        <Field
          placeholder="Password (min 6 characters)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
          error={error}
          containerStyle={s.field}
          onSubmitEditing={handleRegister}
          returnKeyType="go"
        />

        <Button label="Continue" onPress={handleRegister} loading={loading} fullWidth style={s.button} />

        <Link href="/(auth)/login" asChild>
          <Txt variant="callout" color="text3" align="center" style={s.link}>
            Already have an account? <Txt variant="callout" color="accent">Sign in</Txt>
          </Txt>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxxl, paddingVertical: spacing.xxxl + spacing.lg },
  stepTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  stepSubtitle: { marginBottom: spacing.xxxl },
  error: { marginBottom: spacing.lg },
  field: { alignSelf: 'stretch', marginBottom: spacing.md },
  button: { marginTop: spacing.sm },
  link: { marginTop: spacing.xxl, paddingVertical: spacing.sm },
  serviceCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg + 2,
    marginBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
}));
