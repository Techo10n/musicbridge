import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { MusicService } from '../../types';

type Step = 'credentials' | 'service';

const SERVICES: Array<{ id: MusicService; label: string; color: string; description: string }> = [
  {
    id: 'spotify',
    label: 'Spotify',
    color: '#1DB954',
    description: 'Green music for the people',
  },
  {
    id: 'apple_music',
    label: 'Apple Music',
    color: '#fc3c44',
    description: 'Over 100 million songs',
  },
  {
    id: 'youtube_music',
    label: 'YouTube Music',
    color: '#FF0000',
    description: 'Official albums, singles & more',
  },
];

export default function Register() {
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signUp, setPrimaryService } = useAuth();
  const router = useRouter();

  const handleRegister = async () => {
    if (!email.trim() || !password || !username.trim() || !displayName.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

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
      router.replace('/(tabs)/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save service selection');
      setLoading(false);
    }
  };

  if (step === 'service') {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>musicbridge</Text>
          <Text style={styles.stepTitle}>Choose your primary service</Text>
          <Text style={styles.stepSubtitle}>
            This is where you'll listen — you can still share to friends on other services.
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          {SERVICES.map((svc) => (
            <TouchableOpacity
              key={svc.id}
              style={[styles.serviceCard, { borderColor: svc.color }]}
              onPress={() => handleServiceSelect(svc.id)}
              disabled={loading}
              activeOpacity={0.8}
            >
              <View style={[styles.serviceIndicator, { backgroundColor: svc.color }]} />
              <View style={styles.serviceInfo}>
                <Text style={styles.serviceLabel}>{svc.label}</Text>
                <Text style={styles.serviceDescription}>{svc.description}</Text>
              </View>
              {loading && <ActivityIndicator color={svc.color} />}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>musicbridge</Text>
        <Text style={styles.stepTitle}>Create your account</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Display Name"
          placeholderTextColor="#555"
          value={displayName}
          onChangeText={setDisplayName}
          autoCapitalize="words"
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Username (e.g. jsmith)"
          placeholderTextColor="#555"
          value={username}
          onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 6 characters)"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkRow} activeOpacity={0.7}>
            <Text style={styles.linkText}>
              Already have an account?{' '}
              <Text style={styles.linkHighlight}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  inner: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  logo: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1.5,
    marginBottom: 8,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  error: {
    color: '#ff4444',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 18,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  button: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  linkRow: {
    paddingVertical: 8,
  },
  linkText: {
    color: '#888',
    fontSize: 14,
  },
  linkHighlight: {
    color: '#ffffff',
    fontWeight: '600',
  },
  // ── Service selection step ──
  serviceCard: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  serviceIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  serviceDescription: {
    color: '#888',
    fontSize: 13,
  },
});
