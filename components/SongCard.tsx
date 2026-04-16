import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SharedItem, MusicService } from '../types';
import { ServiceBadge } from './ServiceBadge';

interface SongCardProps {
  item: SharedItem;
  isResolving?: boolean;
  onPress: (item: SharedItem) => void;
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export function SongCard({ item, isResolving, onPress }: SongCardProps) {
  const isUnread = !item.opened;

  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.cardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
      disabled={isResolving}
    >
      {/* Cover art */}
      <Image
        source={item.cover_image_url ? { uri: item.cover_image_url } : require('../assets/icon.png')}
        style={styles.cover}
      />

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {isUnread && <View style={styles.unreadDot} />}
        </View>

        {item.artist && (
          <Text style={styles.artist} numberOfLines={1}>
            {item.artist}
          </Text>
        )}

        <View style={styles.meta}>
          {item.sender && (
            <Text style={styles.sender}>
              from <Text style={styles.senderName}>{item.sender.display_name}</Text>
            </Text>
          )}
          <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
        </View>

        {item.message && (
          <Text style={styles.message} numberOfLines={2}>
            "{item.message}"
          </Text>
        )}
      </View>

      {/* Service badge or Loading Spinner */}
      <View style={styles.badgeContainer}>
        {isResolving ? (
          <ActivityIndicator color="#888" size="small" />
        ) : item.sender?.primary_service ? (
          <View style={styles.badge}>
            <ServiceBadge service={item.sender.primary_service as MusicService} size="small" />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 12,
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#fff',
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#2a2a2a',
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  title: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  titleUnread: {
    color: '#fff',
    fontWeight: '700',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#fff',
  },
  artist: {
    color: '#888',
    fontSize: 13,
    marginBottom: 6,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sender: {
    color: '#666',
    fontSize: 12,
  },
  senderName: {
    color: '#888',
    fontWeight: '600',
  },
  time: {
    color: '#555',
    fontSize: 12,
  },
  message: {
    color: '#777',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  badgeContainer: {
    paddingTop: 2,
  },
  badge: {
    // any existing badge styles, or keep empty if none
  },
});
