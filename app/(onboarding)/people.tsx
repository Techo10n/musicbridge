import { useEffect, useState } from 'react';
import { ActivityIndicator, Share, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { useFollows } from '../../hooks/useFollows';
import { makeStyles, useTheme } from '../../lib/theme';
import { User } from '../../types';
import { OnboardingStep } from '../../components/OnboardingStep';
import { Avatar, Button, EmptyState, ListRow, Txt, useToast } from '../../components/ui';

export default function PeopleStep() {
  const s = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { getSuggestedUsers, followUser } = useFollows();

  const [suggested, setSuggested] = useState<User[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const people = await getSuggestedUsers(12);
        if (!cancelled) setSuggested(people);
      } catch {
        if (!cancelled) setSuggested([]);
      }
    })();
    return () => { cancelled = true; };
  }, [getSuggestedUsers]);

  const follow = async (target: User) => {
    setFollowed((prev) => new Set(prev).add(target.id));
    try {
      await followUser(target.id);
    } catch {
      setFollowed((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      toast.show({ kind: 'error', message: `Could not follow ${target.display_name}` });
    }
  };

  const invite = async () => {
    if (!user) return;
    try {
      await Share.share({
        message: `I'm on Museaic as @${user.username}. It sends songs across Spotify, Apple Music and YouTube Music: museaic://profile/${user.username}`,
      });
    } catch {
      toast.show({ kind: 'error', message: 'Could not open the share sheet' });
    }
  };

  return (
    <OnboardingStep
      title="Find your people"
      subtitle="Sharing needs someone on the other end. Follow a few now, or invite a friend."
      step={3}
      totalSteps={4}
      headerRight={
        <TouchableOpacity onPress={() => router.replace('/(onboarding)/permissions')} hitSlop={10} accessibilityRole="button">
          <Txt variant="callout" color="text3">Skip</Txt>
        </TouchableOpacity>
      }
      footer={
        <Button
          label={followed.size > 0 ? `Continue with ${followed.size}` : 'Continue'}
          fullWidth
          onPress={() => router.replace('/(onboarding)/permissions')}
        />
      }
    >
      <TouchableOpacity style={s.inviteCard} onPress={invite} activeOpacity={0.85} accessibilityRole="button">
        <View style={s.inviteIcon}>
          <Ionicons name="paper-plane" size={18} color={colors.accentInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="bodyStrong">Invite a friend</Txt>
          <Txt variant="caption" color="text3">Send them your profile link</Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text3} />
      </TouchableOpacity>

      {suggested === null ? (
        <View style={s.loading}><ActivityIndicator color={colors.accent} /></View>
      ) : suggested.length === 0 ? (
        <EmptyState
          compact
          icon="people-outline"
          title="Nobody to suggest yet"
          body="Museaic is new for you. Invite someone and they'll show up here."
        />
      ) : (
        <View style={s.list}>
          <Txt variant="micro" color="text3">Suggested</Txt>
          {suggested.map((person) => {
            const done = followed.has(person.id);
            return (
              <ListRow
                key={person.id}
                leading={<Avatar name={person.display_name} avatarUrl={person.avatar_url} size={44} />}
                title={person.display_name}
                subtitle={`@${person.username}`}
                trailing={
                  <TouchableOpacity
                    style={[s.followBtn, done && s.followBtnDone]}
                    onPress={() => follow(person)}
                    disabled={done}
                    accessibilityRole="button"
                  >
                    <Txt variant="captionStrong" style={done ? s.followTextDone : s.followText}>
                      {done ? 'Following' : 'Follow'}
                    </Txt>
                  </TouchableOpacity>
                }
              />
            );
          })}
        </View>
      )}
    </OnboardingStep>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing }) => ({
  inviteCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.line,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  inviteIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  loading: { paddingVertical: spacing.xxxl, alignItems: 'center' },
  list: { gap: spacing.xs },
  followBtn: {
    backgroundColor: colors.accent, borderRadius: radius.pill,
    paddingVertical: spacing.sm - 1, paddingHorizontal: spacing.lg,
  },
  followBtnDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.lineStrong },
  followText: { color: colors.accentInk },
  followTextDone: { color: colors.text3 },
}));
