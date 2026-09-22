import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { SERVICES, serviceLabel } from '../../lib/services';
import { makeStyles, useTheme } from '../../lib/theme';
import { MusicService } from '../../types';
import { OnboardingStep } from '../../components/OnboardingStep';
import { ServiceDot, Txt, useToast } from '../../components/ui';

const BLURB: Record<MusicService, string> = {
  spotify: 'Playlists, liked songs, and your top artists',
  apple_music: 'Your library, through MusicKit',
  youtube_music: 'Liked music and playlists, through Google',
};

export default function ServiceStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user, setPrimaryService, refreshUser } = useAuth();
  const [connecting, setConnecting] = useState<MusicService | null>(null);

  const connect = async (service: MusicService) => {
    if (!user?.id || connecting) return;
    setConnecting(service);
    try {
      // Set it first so the choice survives a failed or abandoned OAuth trip:
      // the user has told us where they listen either way.
      await setPrimaryService(service);

      const ok = service === 'spotify' ? await Spotify.connectSpotify(user.id)
        : service === 'apple_music' ? await AppleMusic.connectAppleMusic(user.id)
        : await YouTubeMusic.connectYouTubeMusic(user.id);

      await refreshUser();
      if (ok) {
        toast.show({ kind: 'success', message: `${serviceLabel(service)} connected` });
      } else {
        toast.show({ message: `You can connect ${serviceLabel(service)} later in Settings` });
      }
      router.replace('/(onboarding)/profile');
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not connect that service' });
    } finally {
      setConnecting(null);
    }
  };

  return (
    <OnboardingStep
      title="Where do you listen?"
      subtitle="Songs your friends send will open here. You can still send to people on any other service."
      step={1}
      totalSteps={4}
    >
      <View style={s.list}>
        {SERVICES.map((service) => (
          <TouchableOpacity
            key={service}
            style={[s.card, connecting === service && s.cardBusy]}
            onPress={() => connect(service)}
            disabled={!!connecting}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <ServiceDot service={service} size={14} />
            <View style={s.cardBody}>
              <Txt variant="bodyStrong">{serviceLabel(service)}</Txt>
              <Txt variant="caption" color="text3">{BLURB[service]}</Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text3} />
          </TouchableOpacity>
        ))}
      </View>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  list: { gap: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
    padding: spacing.lg + 2,
  },
  cardBusy: { opacity: 0.55, borderColor: colors.accent },
  cardBody: { flex: 1, minWidth: 0 },
}));
