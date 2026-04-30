import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { pickAndUploadAvatar } from '../../lib/avatarUpload';
import { AppBar, IconBtn, Avatar, CoverArt } from '../../components/ui';
import { colors } from '../../lib/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type SettingsPrefs = {
  publicProfile: boolean;
  showListening: boolean;
  allowReactions: boolean;
  notifShares: boolean;
  notifFollows: boolean;
  notifReactions: boolean;
  notifStories: boolean;
};

const defaultPrefs: SettingsPrefs = {
  publicProfile: true,
  showListening: true,
  allowReactions: true,
  notifShares: true,
  notifFollows: true,
  notifReactions: true,
  notifStories: true,
};

const settingsKey = (userId: string) => `musicbridge_settings_${userId}`;

function Row({
  icon, label, value, onPress, danger, toggle, toggleVal, onToggle, noChevron,
}: {
  icon: IoniconName; label: string; value?: string; onPress?: () => void;
  danger?: boolean; toggle?: boolean; toggleVal?: boolean; onToggle?: (v: boolean) => void;
  noChevron?: boolean;
}) {
  const C = onPress ? TouchableOpacity : View;
  const pressProps = onPress ? { onPress, activeOpacity: 0.8 } : {};
  return (
    <C style={styles.settingRow} {...pressProps}>
      <View style={styles.settingIconBox}>
        <Ionicons name={icon} size={18} color={danger ? colors.coral : colors.primary} />
      </View>
      <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
      <View style={styles.settingRight}>
        {value ? <Text style={styles.settingValue} numberOfLines={1}>{value}</Text> : null}
        {toggle ? <Switch value={toggleVal} onValueChange={onToggle} trackColor={{ false: colors.line2, true: colors.primary }} thumbColor="#fff" /> : null}
        {!toggle && !noChevron && <Ionicons name="chevron-forward" size={16} color={colors.fg3} />}
      </View>
    </C>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function Settings() {
  const { user, session, signOut, refreshUser } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();

  // Edit profile state
  const [editVisible, setEditVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPhoto, setChangingPhoto] = useState(false);

  // Privacy toggles
  const [publicProfile, setPublicProfile] = useState(true);
  const [showListening, setShowListening] = useState(true);
  const [allowReactions, setAllowReactions] = useState(true);

  // Notification toggles
  const [notifShares, setNotifShares] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifReactions, setNotifReactions] = useState(true);
  const [notifStories, setNotifStories] = useState(true);

  const applyPrefs = (prefs: SettingsPrefs) => {
    setPublicProfile(prefs.publicProfile);
    setShowListening(prefs.showListening);
    setAllowReactions(prefs.allowReactions);
    setNotifShares(prefs.notifShares);
    setNotifFollows(prefs.notifFollows);
    setNotifReactions(prefs.notifReactions);
    setNotifStories(prefs.notifStories);
  };

  const currentPrefs = (): SettingsPrefs => ({
    publicProfile,
    showListening,
    allowReactions,
    notifShares,
    notifFollows,
    notifReactions,
    notifStories,
  });

  const savePrefs = async (nextPrefs: SettingsPrefs) => {
    if (!user?.id) return;
    try {
      await AsyncStorage.setItem(settingsKey(user.id), JSON.stringify(nextPrefs));
    } catch (err) {
      console.error('[Settings] save preferences failed:', err);
      Alert.alert('Settings not saved', 'Could not save this preference.');
    }
  };

  const updatePref = <K extends keyof SettingsPrefs>(key: K, value: SettingsPrefs[K]) => {
    const next = { ...currentPrefs(), [key]: value };
    applyPrefs(next);
    void savePrefs(next);
  };

  const openEdit = () => {
    setDraftName(user?.display_name ?? '');
    setDraftBio(user?.bio ?? '');
    setEditVisible(true);
  };

  useEffect(() => {
    if (params.edit === '1' && !editVisible) {
      openEdit();
    }
  }, [editVisible, params.edit]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(settingsKey(user.id));
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as Partial<SettingsPrefs>;
        applyPrefs({ ...defaultPrefs, ...parsed });
      } catch (err) {
        console.error('[Settings] load preferences failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('users').update({
        display_name: draftName.trim() || user.display_name,
        bio: draftBio.trim() || null,
      }).eq('id', user.id);
      if (error) throw error;
      await refreshUser();
      setEditVisible(false);
      Alert.alert('Saved', 'Profile updated.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not save changes.');
    }
    finally { setSaving(false); }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert('Delete Account', 'This permanently removes your account and all data. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Contact Support', 'Email support@musicbridge.app to delete your account.') },
    ]);
  };

  const handleChangePassword = async () => {
    const email = session?.user.email;
    if (!email) {
      Alert.alert('Password reset unavailable', 'No email address is available for this account.');
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      Alert.alert('Password reset sent', `Check ${email} for a reset link.`);
    } catch {
      Alert.alert('Error', 'Could not send a password reset email.');
    }
  };

  const handleChangePhoto = async () => {
    if (!user || changingPhoto) return;
    setChangingPhoto(true);
    try {
      const upload = await pickAndUploadAvatar(user.id);
      if (upload) await refreshUser();
    } catch {
      Alert.alert('Error', 'Could not update photo.');
    } finally {
      setChangingPhoto(false);
    }
  };

  const showUnavailable = (feature: string) => {
    Alert.alert(feature, `${feature} is not currently available.`);
  };

  if (!user) return null;

  const initials = (user.display_name ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar
        left={
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.fg2} />
          </TouchableOpacity>
        }
        title="Settings"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>

        {/* ── Profile card ── */}
        <TouchableOpacity style={styles.profileCard} onPress={openEdit} activeOpacity={0.85}>
          <Avatar name={user.display_name} avatarUrl={user.avatar_url} size={60} ring="primary" />
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user.display_name}</Text>
            <Text style={styles.profileUsername}>@{user.username}</Text>
            {user.bio ? <Text style={styles.profileBio} numberOfLines={1}>{user.bio}</Text> : null}
          </View>
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={14} color={colors.primaryInk} />
          </View>
        </TouchableOpacity>

        {/* ── Account ── */}
        <Section title="Account">
          <Row icon="person-outline" label="Display Name" value={user.display_name} onPress={openEdit} />
          <Row icon="at-outline" label="Username" value={`@${user.username}`} noChevron />
          <Row icon="mail-outline" label="Email" value={(user as any).email ?? 'Not available'} noChevron />
          <Row icon="camera-outline" label="Change Photo" value={changingPhoto ? 'Updating...' : undefined} onPress={handleChangePhoto} />
          <Row icon="key-outline" label="Change Password" onPress={handleChangePassword} />
        </Section>

        {/* ── Privacy ── */}
        <Section title="Privacy">
          <Row icon="earth-outline" label="Public Profile" toggle toggleVal={publicProfile} onToggle={(v) => updatePref('publicProfile', v)} />
          <Row icon="musical-note-outline" label="Show Listening Activity" toggle toggleVal={showListening} onToggle={(v) => updatePref('showListening', v)} />
          <Row icon="happy-outline" label="Allow Reactions" toggle toggleVal={allowReactions} onToggle={(v) => updatePref('allowReactions', v)} />
          <Row icon="lock-closed-outline" label="Block List" onPress={() => Alert.alert('Block List', 'No blocked users.')} />
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications">
          <Row icon="paper-plane-outline" label="New Shares" toggle toggleVal={notifShares} onToggle={(v) => updatePref('notifShares', v)} />
          <Row icon="person-add-outline" label="New Followers" toggle toggleVal={notifFollows} onToggle={(v) => updatePref('notifFollows', v)} />
          <Row icon="happy-outline" label="Reactions" toggle toggleVal={notifReactions} onToggle={(v) => updatePref('notifReactions', v)} />
          <Row icon="radio-outline" label="Stories" toggle toggleVal={notifStories} onToggle={(v) => updatePref('notifStories', v)} />
        </Section>

        {/* ── App ── */}
        <Section title="App">
          <Row icon="information-circle-outline" label="About MusicBridge" onPress={() => Alert.alert('MusicBridge', 'v1.0.0 — Made with ♥')} />
          <Row icon="document-text-outline" label="Terms of Service" onPress={() => showUnavailable('Terms of Service')} />
          <Row icon="shield-outline" label="Privacy Policy" onPress={() => showUnavailable('Privacy Policy')} />
          <Row icon="star-outline" label="Rate the App" onPress={() => showUnavailable('Rate the App')} />
          <Row icon="chatbubble-outline" label="Send Feedback" onPress={() => Alert.alert('Feedback', 'Email hello@musicbridge.app')} />
        </Section>

        {/* ── Danger zone ── */}
        <Section title="Account Actions">
          <Row icon="log-out-outline" label="Sign Out" onPress={handleSignOut} danger />
          <Row icon="trash-outline" label="Delete Account" onPress={handleDeleteAccount} danger />
        </Section>

      </ScrollView>

      {/* ── Edit Profile modal ── */}
      {editVisible && (
        <View style={styles.editOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setEditVisible(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editSheetWrap}
          >
            <ScrollView
              contentContainerStyle={styles.editSheet}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            >
              <View style={styles.editSheetHandle} />
              <Text style={styles.editSheetTitle}>Edit Profile</Text>

              <Text style={styles.editLabel}>Display Name</Text>
              <TextInput
                style={styles.editInput}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Display name"
                placeholderTextColor={colors.fg4}
                autoCapitalize="words"
                maxLength={50}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.editLabel}>Bio</Text>
              <TextInput
                style={[styles.editInput, styles.editInputMulti]}
                value={draftBio}
                onChangeText={setDraftBio}
                placeholder="Write a bio…"
                placeholderTextColor={colors.fg4}
                multiline
                maxLength={160}
                textAlignVertical="top"
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.primaryInk} size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 24, marginTop: 8,
    backgroundColor: colors.bgCard, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: colors.line,
  },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.fg, marginBottom: 2 },
  profileUsername: { fontSize: 13, color: colors.fg3 },
  profileBio: { fontSize: 12, color: colors.fg2, marginTop: 3 },
  editBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.fg3,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 20, marginBottom: 8,
  },
  sectionCard: {
    marginHorizontal: 16, backgroundColor: colors.bgCard,
    borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  settingIconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: colors.bgElev, alignItems: 'center', justifyContent: 'center',
  },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.fg },
  settingLabelDanger: { color: colors.coral },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { fontSize: 13, color: colors.fg3, maxWidth: 140 },

  // Edit modal
  editOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 100, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  editSheetWrap: { justifyContent: 'flex-end' },
  editSheet: {
    backgroundColor: colors.bgElev,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: colors.line,
    flexGrow: 1,
    maxHeight: '82%',
  },
  editSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: 'center', marginBottom: 20 },
  editSheetTitle: { fontSize: 20, fontWeight: '700', color: colors.fg, marginBottom: 20 },
  editLabel: { fontSize: 12, fontWeight: '600', color: colors.fg3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  editInput: {
    backgroundColor: colors.bgCard, borderRadius: 12,
    padding: 13, color: colors.fg, fontSize: 15,
    borderWidth: 1, borderColor: colors.line,
  },
  editInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: colors.primary, borderRadius: 999,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: colors.primaryInk, fontSize: 16, fontWeight: '700' },
});
