import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { parseReelUrl } from '../lib/reelParser';

interface ReelImportBannerProps {
  url: string | null;
  onFindSong: () => void;
  onDismiss: () => void;
}

/**
 * A slim persistent banner that appears near the bottom of the screen when an
 * Instagram reel URL is detected in the clipboard.
 */
export function ReelImportBanner({ url, onFindSong, onDismiss }: ReelImportBannerProps) {
  const insets = useSafeAreaInsets();

  if (!url) return null;

  const parsed = parseReelUrl(url);
  const platformIcon = parsed?.platform === 'tiktok' ? 'musical-notes' : 'logo-instagram';
  const platformLabel = parsed?.platform === 'tiktok' ? 'TikTok' : 'Instagram';

  return (
    <View style={[styles.banner, { bottom: insets.bottom + 16 }]}>
      <Ionicons name={platformIcon as any} size={16} color="#fff" style={styles.icon} />
      <Text style={styles.text} numberOfLines={1}>
        {platformLabel} reel detected
      </Text>
      <TouchableOpacity style={styles.findButton} onPress={onFindSong} activeOpacity={0.8}>
        <Text style={styles.findText}>Find Song</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onDismiss} style={styles.closeButton} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={15} color="#888" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    // Shadow for iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    // Elevation for Android
    elevation: 8,
  },
  icon: {
    opacity: 0.9,
  },
  text: {
    flex: 1,
    color: '#ccc',
    fontSize: 13,
  },
  findButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  findText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '700',
  },
  closeButton: {
    padding: 2,
  },
});
