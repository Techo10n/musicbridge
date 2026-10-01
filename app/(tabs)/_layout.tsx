import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather, Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '../../lib/theme';
import { ShareComposer } from '../../components/ShareComposer';
import { ConversionPill } from '../../components/ConversionPill';

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
      <View style={s.shareCircle}>
        {/* Feather rather than Ionicons: its strokes have rounded caps and
            joins, which matches the rest of the app. Ionicons' paper-plane is
            a hard-edged solid. */}
        <Feather name="send" size={17} color={colors.accentInk} />
      </View>
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <>
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
          tabBarButton: () => <ShareTabButton onPress={() => setComposerOpen(true)} />,
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
    <ConversionPill />
    <ShareComposer visible={composerOpen} onClose={() => setComposerOpen(false)} />
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // 9, not the bar's own 10: measured against a screenshot, the icons' glyphs
  // start a point above where the padding alone would put them.
  shareBtnWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 9 },
  shareCircle: {
    // 34 is the measured distance from the top of a tab icon to the bottom of
    // its label, so the circle spans exactly the other tabs' full height.
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
}));
