import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppBar } from '../../components/ui';
import { ReelImportModal } from '../../components/ReelImportModal';
import { parseReelUrl } from '../../lib/reelParser';
import { colors } from '../../lib/theme';

export default function ShareScreen() {
  const router = useRouter();
  const [reelText, setReelText] = useState('');
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  const handleIdentify = () => {
    const parsed = parseReelUrl(reelText);
    if (!parsed) {
      Alert.alert('Invalid link', 'Paste an Instagram Reel or TikTok link first.');
      return;
    }
    setModalUrl(parsed.originalUrl);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppBar
        title="Identify a Reel"
        right={
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.fg3} />
          </TouchableOpacity>
        }
      />

      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Ionicons name="radio-outline" size={24} color={colors.primaryInk} />
        </View>
        <Text style={styles.title}>Paste a reel link</Text>
        <Text style={styles.subtitle}>Museaic will scan the clip and find songs it can share or save.</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="link-outline" size={18} color={colors.fg3} />
          <TextInput
            style={styles.input}
            placeholder="https://www.instagram.com/reel/..."
            placeholderTextColor={colors.fg4}
            value={reelText}
            onChangeText={setReelText}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleIdentify}
          />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={handleIdentify} activeOpacity={0.85}>
          <Ionicons name="sparkles-outline" size={17} color={colors.primaryInk} />
          <Text style={styles.primaryBtnText}>Identify Songs</Text>
        </TouchableOpacity>
      </View>

      <ReelImportModal
        reelUrl={modalUrl}
        onClose={() => setModalUrl(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, paddingTop: 34, gap: 16 },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.fg, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.fg3, fontSize: 14, lineHeight: 20, maxWidth: 320 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 6,
  },
  input: { flex: 1, color: colors.fg, fontSize: 14 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 15,
  },
  primaryBtnText: { color: colors.primaryInk, fontSize: 15, fontWeight: '800' },
});
