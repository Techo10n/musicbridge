import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { pickAndUploadAvatar } from '../../lib/avatarUpload';
import { AppBar, Avatar, SegmentedTabs, Txt, useToast } from '../../components/ui';
import { MusicServiceButton } from '../../components/MusicServiceButton';
import { MusicService } from '../../types';
import * as Spotify from '../../lib/spotify';
import * as AppleMusic from '../../lib/appleMusic';
import * as YouTubeMusic from '../../lib/youtubeMusic';
import { APPEARANCE_OPTIONS, makeStyles, serviceColor, useAppearance, useTheme } from '../../lib/theme';
import { serviceLabel } from '../../lib/services';
import { setListeningHistoryPref, useListeningHistoryPref } from '../../lib/listeningHistory';
import { appStoreUrl, appVersion, privacyUrl, supportMailto, termsUrl } from '../../lib/support';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
/**
 * Push preferences. These live on `public.users` rather than in AsyncStorage
 * because the thing that honours them is the send-notification edge function,
 * which never sees this device. The old local-only copies of these switches
 * changed nothing at all.
 */
type NotificationPrefs = {
  notify_shares: boolean;
  notify_follows: boolean;
};

const SERVICES: MusicService[] = ['spotify', 'apple_music', 'youtube_music'];

function Row({
  icon, label, value, onPress, danger, toggle, toggleVal, onToggle, noChevron,
}: {
  icon: IoniconName; label: string; value?: string; onPress?: () => void;
  danger?: boolean; toggle?: boolean; toggleVal?: boolean; onToggle?: (v: boolean) => void;
  noChevron?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const C = onPress ? TouchableOpacity : View;
  const pressProps = onPress ? { onPress, activeOpacity: 0.8 } : {};
  return (
    <C style={styles.settingRow} {...pressProps}>
      <View style={styles.settingIconBox}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
      </View>
      <Text style={[styles.settingLabel, danger && styles.settingLabelDanger]}>{label}</Text>
      <View style={styles.settingRight}>
        {value ? <Text style={styles.settingValue} numberOfLines={1}>{value}</Text> : null}
        {toggle ? <Switch value={toggleVal} onValueChange={onToggle} trackColor={{ false: colors.lineStrong, true: colors.accent }} thumbColor={colors.brandInk} /> : null}
        {!toggle && !noChevron && <Ionicons name="chevron-forward" size={16} color={colors.text3} />}
      </View>
    </C>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { appearance, setAppearance } = useAppearance();
  const { user, session, signOut, refreshUser, setPrimaryService } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();

  // Edit profile state
  const [editVisible, setEditVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBio, setDraftBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [loadingService, setLoadingService] = useState<MusicService | null>(null);

  // Shared with Profile, which shows the same switch above recent tracks.
  const showListening = useListeningHistoryPref();

  const [notifs, setNotifs] = useState<NotificationPrefs>({ notify_shares: true, notify_follows: true });

  /**
   * Moves the switch first, then writes. If the write fails the switch goes
   * back, because a toggle that stays where you put it while the server
   * disagrees is how people end up muting nothing.
   */
  const updateNotif = async <K extends keyof NotificationPrefs>(key: K, value: boolean) => {
    if (!user?.id) return;
    const previous = notifs[key];
    setNotifs((prev) => ({ ...prev, [key]: value }));
    const { error } = await supabase.from('users').update({ [key]: value }).eq('id', user.id);
    if (error) {
      setNotifs((prev) => ({ ...prev, [key]: previous }));
      toast.show({ kind: 'error', message: 'Could not save that preference' });
    }
  };

  const openLink = async (url: string, failure: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast.show({ kind: 'error', message: failure });
    }
  };

  const openEdit = () => {
    setDraftName(user?.display_name ?? '');
    setDraftBio(user?.bio ?? '');
    setEditVisible(true);
  };

  // Deep link `?edit=1` opens the edit sheet. The state writes happen in a
  // microtask so this never cascades a render from inside the effect body.
  useEffect(() => {
    if (params.edit !== '1' || editVisible) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setDraftName(user?.display_name ?? '');
      setDraftBio(user?.bio ?? '');
      setEditVisible(true);
    });
    return () => { cancelled = true; };
  }, [editVisible, params.edit, user?.display_name, user?.bio]);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('notify_shares, notify_follows')
        .eq('id', userId)
        .single();
      if (cancelled) return;
      if (error) {
        console.error('[Settings] load notification preferences failed:', error);
        return;
      }
      setNotifs({
        notify_shares: data.notify_shares ?? true,
        notify_follows: data.notify_follows ?? true,
      });
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
      toast.show({ kind: 'success', message: 'Profile updated' });
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not save changes' });
    }
    finally { setSaving(false); }
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const isConnected = (svc: MusicService) => {
    switch (svc) {
      case 'spotify': return !!user?.spotify_access_token;
      case 'apple_music': return !!user?.apple_music_user_token;
      case 'youtube_music': return !!user?.youtube_access_token;
    }
  };

  const handleConnect = async (svc: MusicService) => {
    if (!user || loadingService) return;
    setLoadingService(svc);
    try {
      let ok = false;
      switch (svc) {
        case 'spotify': ok = await Spotify.connectSpotify(user.id); break;
        case 'apple_music': ok = await AppleMusic.connectAppleMusic(user.id); break;
        case 'youtube_music': ok = await YouTubeMusic.connectYouTubeMusic(user.id); break;
      }
      await refreshUser();
      if (ok) toast.show({ kind: 'success', message: `${serviceLabel(svc)} connected` });
      else toast.show({ kind: 'error', message: `Could not connect ${serviceLabel(svc)}` });
    } catch (err) {
      toast.show({ kind: 'error', message: err instanceof Error ? err.message : 'Could not connect that service' });
    } finally {
      setLoadingService(null);
    }
  };

  const handleDisconnect = (svc: MusicService) => {
    const userId = user?.id;
    if (!userId || loadingService) return;
    Alert.alert(`Disconnect ${serviceLabel(svc)}?`, 'You can reconnect anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setLoadingService(svc);
          try {
            switch (svc) {
              case 'spotify': await Spotify.disconnectSpotify(userId); break;
              case 'apple_music': await AppleMusic.disconnectAppleMusic(userId); break;
              case 'youtube_music': await YouTubeMusic.disconnectYouTubeMusic(userId); break;
            }
            await refreshUser();
          } catch {
            toast.show({ kind: 'error', message: `Could not disconnect ${serviceLabel(svc)}` });
          } finally {
            setLoadingService(null);
          }
        },
      },
    ]);
  };

  const handleSetPrimary = async (svc: MusicService) => {
    if (!user || user.primary_service === svc) return;
    try {
      await setPrimaryService(svc);
    } catch {
      toast.show({ kind: 'error', message: 'Could not update your primary service' });
    }
  };

  // Deletion is a written request rather than a button: it removes shares other
  // people received, so it is handled by a human who can confirm it is wanted.
  const deleteRequest = supportMailto('Delete my Museaic account', user?.username);

  const handleDeleteAccount = () => {
    if (!deleteRequest) return;
    Alert.alert(
      'Delete Account',
      'This permanently removes your account and everything you have shared. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request deletion',
          style: 'destructive',
          onPress: () => void openLink(deleteRequest, 'Could not open your mail app'),
        },
      ],
    );
  };

  const handleChangePassword = async () => {
    const email = session?.user.email;
    if (!email) {
      toast.show({ kind: 'error', message: 'No email address on this account' });
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast.show({ kind: 'success', message: `Reset link sent to ${email}` });
    } catch {
      toast.show({ kind: 'error', message: 'Could not send a reset email' });
    }
  };

  const handleChangePhoto = async () => {
    if (!user || changingPhoto) return;
    setChangingPhoto(true);
    try {
      const upload = await pickAndUploadAvatar(user.id);
      if (upload) await refreshUser();
    } catch {
      toast.show({ kind: 'error', message: 'Could not update your photo' });
    } finally {
      setChangingPhoto(false);
    }
  };

  if (!user) return null;

  const primarySvc = user.primary_service as MusicService | null;
  const terms = termsUrl();
  const privacy = privacyUrl();
  const storeUrl = appStoreUrl();
  const feedback = supportMailto('Museaic feedback', user.username);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar
        left={
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="chevron-back" size={22} color={colors.text2} />
          </TouchableOpacity>
        }
        title="Settings"
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>

        {/* ── Profile card ── */}
        <TouchableOpacity style={styles.profileCard} onPress={openEdit} activeOpacity={0.85}>
          <Avatar name={user.display_name} avatarUrl={user.avatar_url} size={60} ring="accent" />
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{user.display_name}</Text>
            <Text style={styles.profileUsername}>@{user.username}</Text>
            {user.bio ? <Text style={styles.profileBio} numberOfLines={1}>{user.bio}</Text> : null}
          </View>
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={14} color={colors.accentInk} />
          </View>
        </TouchableOpacity>

        {/* ── Appearance ── */}
        <Section title="Appearance">
          <View style={styles.appearanceBlock}>
            <Txt variant="callout" color="text3" style={styles.appearanceHint}>
              System follows your device&apos;s light or dark setting.
            </Txt>
            <SegmentedTabs
              tabs={APPEARANCE_OPTIONS}
              value={appearance}
              onChange={setAppearance}
              variant="pill"
            />
          </View>
        </Section>

        {/* ── Account ── */}
        <Section title="Account">
          <Row icon="log-out-outline" label="Sign Out" onPress={handleSignOut} danger />
          <Row icon="person-outline" label="Display Name" value={user.display_name} onPress={openEdit} />
          <Row icon="at-outline" label="Username" value={`@${user.username}`} noChevron />
          <Row icon="mail-outline" label="Email" value={(user as any).email ?? 'Not available'} noChevron />
          <Row icon="camera-outline" label="Change Photo" value={changingPhoto ? 'Updating...' : undefined} onPress={handleChangePhoto} />
          <Row icon="key-outline" label="Change Password" onPress={handleChangePassword} />
        </Section>

        {/* ── Streaming services ── */}
        <Section title="Streaming Services">
          <View style={styles.serviceSectionIntro}>
            <Text style={styles.serviceSectionText}>
              Manage connected services and choose where shared songs open.
            </Text>
          </View>
          {SERVICES.map((svc) => (
            <View key={svc} style={styles.serviceSettingBlock}>
              <MusicServiceButton
                service={svc}
                connected={isConnected(svc)}
                onConnect={() => handleConnect(svc)}
                onDisconnect={() => handleDisconnect(svc)}
                loading={loadingService === svc}
                isPrimary={primarySvc === svc}
              />
              {isConnected(svc) && primarySvc !== svc && (
                <TouchableOpacity style={styles.setPrimaryRow} onPress={() => handleSetPrimary(svc)} activeOpacity={0.8}>
                  <View style={[styles.serviceDot, { backgroundColor: serviceColor(colors, svc) }]} />
                  <Text style={styles.setPrimaryText}>Set {serviceLabel(svc)} as primary</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </Section>

        {/* ── Privacy ── */}
        <Section title="Privacy">
          <View style={styles.serviceSectionIntro}>
            <Text style={styles.serviceSectionText}>
              Listening activity shows your recent plays on your profile. It is off until you turn it on.
            </Text>
          </View>
          <Row
            icon="musical-note-outline"
            label="Show Listening Activity"
            toggle
            toggleVal={showListening}
            onToggle={(v) => { void setListeningHistoryPref(user.id, v); }}
          />
        </Section>

        {/* ── Notifications ── */}
        <Section title="Notifications">
          <Row
            icon="paper-plane-outline"
            label="New Shares"
            toggle
            toggleVal={notifs.notify_shares}
            onToggle={(v) => { void updateNotif('notify_shares', v); }}
          />
          <Row
            icon="person-add-outline"
            label="New Followers"
            toggle
            toggleVal={notifs.notify_follows}
            onToggle={(v) => { void updateNotif('notify_follows', v); }}
          />
        </Section>

        {/* ── App ── */}
        {/* Rows appear only where there is somewhere to go. A permanent row that
            opens "not currently available" reads as a broken feature. */}
        <Section title="App">
          <Row icon="information-circle-outline" label="Version" value={appVersion()} noChevron />
          {terms ? (
            <Row icon="document-text-outline" label="Terms of Service" onPress={() => void openLink(terms, 'Could not open Terms of Service')} />
          ) : null}
          {privacy ? (
            <Row icon="shield-outline" label="Privacy Policy" onPress={() => void openLink(privacy, 'Could not open the Privacy Policy')} />
          ) : null}
          {storeUrl ? (
            <Row icon="star-outline" label="Rate the App" onPress={() => void openLink(storeUrl, 'Could not open the App Store')} />
          ) : null}
          {feedback ? (
            <Row icon="chatbubble-outline" label="Send Feedback" onPress={() => void openLink(feedback, 'Could not open your mail app')} />
          ) : null}
        </Section>

        {/* ── Danger zone ── */}
        {deleteRequest ? (
          <Section title="Account Actions">
            <Row icon="trash-outline" label="Delete Account" onPress={handleDeleteAccount} danger />
          </Section>
        ) : null}

      </ScrollView>

      {/* ── Edit Profile modal ── */}
      {editVisible && (
        <View style={styles.editOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setEditVisible(false)} />
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
                placeholderTextColor={colors.text4}
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
                placeholderTextColor={colors.text4}
                multiline
                maxLength={160}
                textAlignVertical="top"
              />

              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
                {saving ? <ActivityIndicator color={colors.accentInk} size="small" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors, radius, spacing, type }) => ({
  container: { flex: 1, backgroundColor: colors.bg },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 24, marginTop: 8,
    backgroundColor: colors.surface, borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: colors.line,
  },
  profileName: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 2 },
  profileUsername: { fontSize: 13, color: colors.text3 },
  profileBio: { fontSize: 12, color: colors.text2, marginTop: 3 },
  editBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: colors.text3,
    textTransform: 'uppercase', letterSpacing: 0.8,
    paddingHorizontal: 20, marginBottom: 8,
  },
  sectionCard: {
    marginHorizontal: 16, backgroundColor: colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  appearanceBlock: { paddingVertical: 14, gap: 12 },
  appearanceHint: { paddingHorizontal: 16 },
  serviceSectionIntro: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  serviceSectionText: { color: colors.text3, fontSize: 13, lineHeight: 18 },
  serviceSettingBlock: { paddingHorizontal: 12, paddingVertical: 6 },
  setPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: -6,
  },
  serviceDot: { width: 8, height: 8, borderRadius: 4 },
  setPrimaryText: { color: colors.text3, fontSize: 12, fontWeight: '600' },

  settingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  settingIconBox: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: colors.bgElev, alignItems: 'center', justifyContent: 'center',
  },
  settingLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
  settingLabelDanger: { color: colors.danger },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  settingValue: { fontSize: 13, color: colors.text3, maxWidth: 140 },

  // Edit modal
  editOverlay: { ...StyleSheet.absoluteFill, zIndex: 100, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  editSheetWrap: { justifyContent: 'flex-end' },
  editSheet: {
    backgroundColor: colors.bgElev,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
    borderTopWidth: 1, borderTopColor: colors.line,
    flexGrow: 1,
    maxHeight: '82%',
  },
  editSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: 20 },
  editSheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text, marginBottom: 20 },
  editLabel: { fontSize: 12, fontWeight: '600', color: colors.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
  editInput: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 13, color: colors.text, fontSize: 15,
    borderWidth: 1, borderColor: colors.line,
  },
  editInputMulti: { minHeight: 80, textAlignVertical: 'top' },
  saveBtn: {
    backgroundColor: colors.accent, borderRadius: 999,
    paddingVertical: 15, alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { color: colors.accentInk, fontSize: 16, fontWeight: '700' },
}));
