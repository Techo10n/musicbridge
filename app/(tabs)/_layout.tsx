import { TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconName)}
      size={24}
      color={focused ? colors.text : colors.text3}
    />
  );
}

/** Center tab: the one place to start a share. */
function ShareTabButton({ onPress }: { onPress: () => void }) {
  const s = useStyles();
  const { colors } = useTheme();
  return (
    <TouchableOpacity style={s.shareBtnWrapper} onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Share a song">
      <View style={s.sharePill}>
        <Ionicons name="paper-plane" size={18} color={colors.accentInk} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: {
          backgroundColor: colors.bgElev,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 20,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.text3,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} /> }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: 'Library', tabBarIcon: ({ focused }) => <TabIcon name="library" focused={focused} /> }}
      />
      <Tabs.Screen
        name="share"
        options={{
          title: '',
          tabBarButton: () => <ShareTabButton onPress={() => router.push('/(tabs)/friends')} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{ title: 'People', tabBarIcon: ({ focused }) => <TabIcon name="people" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'You', tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} /> }}
      />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ href: null }} />
    </Tabs>
  );
}

const useStyles = makeStyles(({ colors, radius }) => ({
  shareBtnWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  sharePill: {
    width: 48, height: 34, borderRadius: radius.md - 2,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
}));
