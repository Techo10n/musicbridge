import { StyleSheet, Text, View } from 'react-native';
import { MusicService } from '../types';

interface ServiceBadgeProps {
  service: MusicService;
  size?: 'small' | 'medium';
}

const SERVICE_CONFIG: Record<MusicService, { color: string; letter: string; label: string }> = {
  spotify: { color: '#1DB954', letter: 'S', label: 'Spotify' },
  apple_music: { color: '#fc3c44', letter: 'A', label: 'Apple Music' },
  youtube_music: { color: '#FF0000', letter: 'Y', label: 'YouTube Music' },
};

export function ServiceBadge({ service, size = 'small' }: ServiceBadgeProps) {
  const config = SERVICE_CONFIG[service];
  const dim = size === 'small' ? 20 : 28;
  const fontSize = size === 'small' ? 10 : 14;

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.color, width: dim, height: dim, borderRadius: dim / 2 },
      ]}
    >
      <Text style={[styles.letter, { fontSize }]}>{config.letter}</Text>
    </View>
  );
}

export function serviceName(service: MusicService): string {
  return SERVICE_CONFIG[service].label;
}


const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    color: '#fff',
    fontWeight: '800',
  },
});
