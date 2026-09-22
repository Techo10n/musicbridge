import { useEffect, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ExpoNotifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { registerForPushNotifications } from '../../lib/notifications';
import { makeStyles, useTheme } from '../../lib/theme';
import { OnboardingStep } from '../../components/OnboardingStep';
import { Button, Txt } from '../../components/ui';

type State = 'idle' | 'granted' | 'denied';

export default function PermissionsStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<State>('idle');
  const [asking, setAsking] = useState(false);

  // Someone may have granted this already on a previous install.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await ExpoNotifications.getPermissionsAsync();
      if (!cancelled && status === 'granted') setNotifications('granted');
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = async () => {
    if (asking || notifications === 'granted') return;
    setAsking(true);
    try {
      const { status } = await ExpoNotifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotifications('granted');
        if (user?.id) await registerForPushNotifications(user.id);
      } else {
        setNotifications('denied');
      }
    } finally {
      setAsking(false);
    }
  };

  const done = () => router.replace('/(tabs)/home');
  const enabledCount = notifications === 'granted' ? 1 : 0;

  return (
    <OnboardingStep
      title="One last thing"
      subtitle={`${enabledCount} of 1 enabled. You can change this any time in Settings.`}
      step={4}
      totalSteps={4}
      footer={
        <>
          <Button label="Start listening" fullWidth onPress={done} />
          {notifications !== 'granted' ? (
            <TouchableOpacity onPress={done} hitSlop={10} accessibilityRole="button">
              <Txt variant="caption" color="text3" align="center">Not now</Txt>
            </TouchableOpacity>
          ) : null}
        </>
      }
    >
      <TouchableOpacity
        style={[s.card, notifications === 'granted' && s.cardDone]}
        onPress={enable}
        disabled={asking || notifications === 'granted'}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <View style={s.icon}>
          <Ionicons name="notifications" size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Notifications</Txt>
          <Txt variant="caption" color="text3">
            {notifications === 'denied'
              ? 'Turned off. Enable it in iOS Settings if you change your mind.'
              : 'Know when a friend sends you a song'}
          </Txt>
        </View>
        <Ionicons
          name={notifications === 'granted' ? 'checkmark-circle' : 'ellipse-outline'}
          size={24}
          color={notifications === 'granted' ? colors.success : colors.line}
        />
      </TouchableOpacity>
    </OnboardingStep>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line, padding: spacing.lg,
  },
  cardDone: { borderColor: colors.success },
  icon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center',
  },
}));
