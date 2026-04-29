import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

function TabIcon({ name, focused }: { name: IoniconName; focused: boolean }) {
  return (
    <Ionicons
      name={focused ? name : (`${name}-outline` as IoniconName)}
      size={24}
      color={focused ? colors.fg : colors.fg3}
    />
  );
}

// Paper-plane icon drawn as a simple SVG-like path via Ionicons
function ShareTabButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.shareBtnWrapper} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.sharePill}>
        <Ionicons name="paper-plane" size={18} color={colors.primaryInk} />
      </View>
    </TouchableOpacity>
  );
}

// Minimal create-action bottom sheet
function CreateMenuModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const items = [
    {
      icon: 'paper-plane-outline' as IoniconName,
      label: 'Share a song',
      sub: 'Send to a friend',
      onPress: () => { onClose(); router.push('/(tabs)/friends'); },
    },
    {
      icon: 'radio-outline' as IoniconName,
      label: 'Identify a reel',
      sub: 'Find a song from a clip',
      onPress: () => { onClose(); router.push('/(tabs)/share'); },
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Share</Text>
        {items.map((item) => (
          <TouchableOpacity key={item.label} style={styles.sheetRow} onPress={item.onPress} activeOpacity={0.8}>
            <View style={styles.sheetIconBox}>
              <Ionicons name={item.icon} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetRowLabel}>{item.label}</Text>
              <Text style={styles.sheetRowSub}>{item.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.fg3} />
          </TouchableOpacity>
        ))}
      </View>
    </Modal>
  );
}

export default function TabLayout() {
  const [createMenuVisible, setCreateMenuVisible] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.bgElev,
            borderTopColor: colors.line,
            borderTopWidth: 1,
            height: 80,
            paddingBottom: 20,
            paddingTop: 10,
          },
          tabBarActiveTintColor: colors.fg,
          tabBarInactiveTintColor: colors.fg3,
          tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            tabBarIcon: ({ focused }) => <TabIcon name="library" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="share"
          options={{
            title: '',
            tabBarButton: () => (
              <ShareTabButton onPress={() => setCreateMenuVisible(true)} />
            ),
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'People',
            tabBarIcon: ({ focused }) => <TabIcon name="people" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'You',
            tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{ href: null }} // hidden from tab bar, navigated via router.push
        />
        <Tabs.Screen
          name="notifications"
          options={{ href: null }} // hidden from tab bar, navigated via router.push
        />
      </Tabs>

      <CreateMenuModal
        visible={createMenuVisible}
        onClose={() => setCreateMenuVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  shareBtnWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  sharePill: {
    width: 48,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bgElev,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 0,
    paddingTop: 10,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    color: colors.fg,
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 24,
    paddingBottom: 12,
    letterSpacing: -0.3,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  sheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowLabel: {
    color: colors.fg,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  sheetRowSub: {
    color: colors.fg3,
    fontSize: 12,
    marginTop: 1,
  },
});
