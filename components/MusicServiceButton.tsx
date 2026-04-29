import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MusicService } from '../types';

interface MusicServiceButtonProps {
  service: MusicService;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  loading?: boolean;
  isPrimary?: boolean;
}

const SERVICE_CONFIG: Record<
  MusicService,
  { label: string; color: string; description: string }
> = {
  spotify: {
    label: 'Spotify',
    color: '#1DB954',
    description: 'Connect your Spotify account',
  },
  apple_music: {
    label: 'Apple Music',
    color: '#fc3c44',
    description: 'Connect via MusicKit',
  },
  youtube_music: {
    label: 'YouTube Music',
    color: '#FF0000',
    description: 'Connect via Google account',
  },
};

export function MusicServiceButton({
  service,
  connected,
  onConnect,
  onDisconnect,
  loading = false,
  isPrimary = false,
}: MusicServiceButtonProps) {
  const config = SERVICE_CONFIG[service];

  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: config.color }]} />
        <View>
          <View style={styles.labelRow}>
            <Text style={styles.label}>{config.label}</Text>
            {isPrimary && <View style={styles.primaryBadge}><Text style={styles.primaryText}>Primary</Text></View>}
          </View>
          <Text style={styles.description}>{config.description}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          connected ? styles.disconnectButton : { backgroundColor: config.color },
          loading && styles.buttonDisabled,
        ]}
        onPress={connected ? onDisconnect : onConnect}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.buttonText, connected && styles.disconnectText]}>
            {connected ? 'Disconnect' : 'Connect'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#26221d',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#332e28',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  label: {
    color: '#f5f0e8',
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBadge: {
    backgroundColor: 'rgba(124,91,244,0.15)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(124,91,244,0.3)',
  },
  primaryText: {
    color: '#9b80f8',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    color: '#8a8075',
    fontSize: 12,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 96,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#2c2822',
    borderWidth: 1,
    borderColor: '#3e3932',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#f5f3ff',
    fontSize: 13,
    fontWeight: '600',
  },
  disconnectText: {
    color: '#8a8075',
  },
});
