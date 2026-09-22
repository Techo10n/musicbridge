import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { pickAndUploadAvatar } from '../../lib/avatarUpload';
import { makeStyles, useTheme } from '../../lib/theme';
import { OnboardingStep } from '../../components/OnboardingStep';
import { Avatar, Button, Field, Txt, useToast } from '../../components/ui';

/** Lowercase letters, digits and underscore, 3–20 characters. */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

/** Strips anything a username may not contain, so the field cannot hold one. */
function sanitize(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

function suggestionsFor(displayName: string, username: string): string[] {
  const base = sanitize(displayName.replace(/\s+/g, '')) || sanitize(username) || 'listener';
  return [`${base}${Math.floor(10 + Math.random() * 89)}`, `${base}_music`, `its${base}`]
    .map(sanitize)
    .filter((s) => USERNAME_RE.test(s))
    .slice(0, 3);
}

export default function ProfileStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, claimProfile, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const seeded = useRef(false);

  // Seed from whatever the provider gave us, once the profile row arrives.
  useEffect(() => {
    if (seeded.current || !user) return;
    seeded.current = true;
    const name = user.display_name && user.display_name !== 'New user' ? user.display_name : '';
    const claimed = user.username_claimed !== false ? user.username : '';
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setDisplayName(name);
      if (claimed) setUsername(claimed);
    });
    return () => { cancelled = true; };
  }, [user]);

  const check = useCallback(async (candidate: string) => {
    if (!USERNAME_RE.test(candidate)) { setAvailability('invalid'); return; }
    setAvailability('checking');
    try {
      const { data, error } = await supabase.rpc('username_available', { candidate });
      if (error) throw error;
      setAvailability(data ? 'free' : 'taken');
    } catch {
      // Don't block on a failed check — the unique index is the real guard.
      setAvailability('idle');
    }
  }, []);

  useEffect(() => {
    const isEmpty = username.length === 0;
    const timer = setTimeout(() => {
      if (isEmpty) { setAvailability('idle'); return; }
      void check(username);
    }, isEmpty ? 0 : 300);
    return () => clearTimeout(timer);
  }, [username, check]);

  const changeAvatar = async () => {
    if (!user?.id || uploading) return;
    setUploading(true);
    try {
      const upload = await pickAndUploadAvatar(user.id);
      if (upload) await refreshUser();
    } catch {
      toast.show({ kind: 'error', message: 'Could not update your photo' });
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (availability === 'taken' || !USERNAME_RE.test(username)) return;
    setSaving(true);
    try {
      await claimProfile(username, displayName);
      router.replace('/(onboarding)/people');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your profile';
      toast.show({ kind: 'error', message });
      if (message.includes('taken')) setAvailability('taken');
    } finally {
      setSaving(false);
    }
  };

  const hint =
    availability === 'checking' ? 'Checking…'
    : availability === 'free' ? `museaic.app/@${username} is yours`
    : undefined;
  const error =
    availability === 'taken' ? 'That username is taken'
    : availability === 'invalid' && username.length > 0
      ? '3 to 20 characters: letters, numbers and underscores'
      : undefined;

  const canContinue = availability === 'free' || (availability === 'idle' && USERNAME_RE.test(username));

  return (
    <OnboardingStep
      title="Pick a name"
      subtitle="Your username is how friends find you. You can change it later."
      step={2}
      totalSteps={4}
      footer={<Button label="Continue" fullWidth loading={saving} disabled={!canContinue} onPress={submit} />}
    >
      <View style={s.avatarRow}>
        <TouchableOpacity onPress={changeAvatar} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add a photo">
          <Avatar name={displayName || user?.display_name} avatarUrl={user?.avatar_url} size={84} ring="accent" />
          <View style={s.avatarBadge}>
            {uploading
              ? <ActivityIndicator size="small" color={colors.accentInk} />
              : <Ionicons name="camera" size={14} color={colors.accentInk} />}
          </View>
        </TouchableOpacity>
        <Txt variant="caption" color="text3">Add a photo</Txt>
      </View>

      <Field
        label="Display name"
        placeholder="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        autoCapitalize="words"
        editable={!saving}
        containerStyle={s.field}
      />

      <Field
        label="Username"
        placeholder="username"
        value={username}
        onChangeText={(t) => setUsername(sanitize(t))}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
        hint={hint}
        error={error}
        containerStyle={s.field}
        trailing={
          availability === 'checking' ? <ActivityIndicator size="small" color={colors.text3} />
          : availability === 'free' ? <Ionicons name="checkmark-circle" size={20} color={colors.success} />
          : availability === 'taken' ? <Ionicons name="close-circle" size={20} color={colors.danger} />
          : null
        }
      />

      {availability === 'taken' ? (
        <View style={s.suggestions}>
          {suggestionsFor(displayName, username).map((candidate) => (
            <TouchableOpacity key={candidate} style={s.suggestion} onPress={() => setUsername(candidate)} accessibilityRole="button">
              <Txt variant="captionStrong" color="accent">{candidate}</Txt>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </OnboardingStep>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  avatarRow: { alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  avatarBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.accent, borderWidth: 3, borderColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
  },
  field: { marginBottom: spacing.md },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestion: {
    borderRadius: radius.pill, backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm,
  },
}));
