import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SharedItem, MusicService } from '../types';
import { ServiceBadge } from './ServiceBadge';

interface PlaylistCardProps {
  item: SharedItem;
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

export function PlaylistCard({ item, onPress }: PlaylistCardProps) {
  const isUnread = !item.opened;
  const trackCount = item.tracks?.length ?? 0;

  return (
    <TouchableOpacity
      style={[styles.card, isUnread && styles.cardUnread]}
      onPress={() => onPress(item)}
      activeOpacity={0.85}
    >
      {/* Cover art with overlay showing track count */}
      <View style={styles.coverWrapper}>
        <Image
          source={item.cover_image_url ? { uri: item.cover_image_url } : require('../assets/icon.png')}
          style={styles.cover}
        />
        <View style={styles.coverOverlay}>
          <Text style={styles.coverOverlayText}>{trackCount}</Text>
          <Text style={styles.coverOverlayLabel}>tracks</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
            {item.title}
          </Text>
          {isUnread && <View style={styles.unreadDot} />}
        </View>

        <Text style={styles.trackCount}>{trackCount} track{trackCount !== 1 ? 's' : ''} · Playlist</Text>

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

      {/* Service badge */}
      {item.sender?.primary_service && (
        <View style={styles.badge}>
          <ServiceBadge service={item.sender.primary_service as MusicService} size="small" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#26221d',
    borderRadius: 14,
    marginHorizontal: 16,
    marginVertical: 5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#332e28',
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: '#7C5BF4',
    backgroundColor: 'rgba(124,91,244,0.06)',
  },
  coverWrapper: {
    position: 'relative',
  },
  cover: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#332e28',
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: 'center',
    paddingVertical: 3,
  },
  coverOverlayText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
  coverOverlayLabel: {
    color: '#ccc',
    fontSize: 8,
    lineHeight: 10,
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
    color: '#c8bfb0',
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  titleUnread: {
    color: '#f5f0e8',
    fontWeight: '700',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#7C5BF4',
  },
  trackCount: {
    color: '#8a8075',
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
    color: '#6a6258',
    fontSize: 12,
  },
  senderName: {
    color: '#8a8075',
    fontWeight: '600',
  },
  time: {
    color: '#5a5248',
    fontSize: 12,
  },
  message: {
    color: '#7a7268',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
  badge: {
    paddingTop: 2,
  },
});
