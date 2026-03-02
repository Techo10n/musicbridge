import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import * as Spotify from '../lib/spotify';
import * as AppleMusic from '../lib/appleMusic';
import * as YouTubeMusic from '../lib/youtubeMusic';
import { useAuth } from '../hooks/useAuth';
import { MusicService, SpotifyTrack, AppleMusicTrack, YouTubeTrack, User } from '../types';
import { serviceName } from './ServiceBadge';
import { resolveArtworkUrl as resolveAppleMusicArtwork } from '../lib/appleMusic';

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  // Raw result for resolving across services
  raw: SpotifyTrack | AppleMusicTrack | YouTubeTrack;
}

interface ShareModalProps {
  visible: boolean;
  recipient: User | null;
  onClose: () => void;
  onShared: () => void;
}

export function ShareModal({ visible, recipient, onClose, onShared }: ShareModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState('');

  const { user } = useAuth();
  const primaryService = user?.primary_service as MusicService | null;

  const handleSearch = useCallback(async () => {
    if (!query.trim() || !user || !primaryService) return;

    setSearching(true);
    setResults([]);

    try {
      let mapped: SearchResult[] = [];

      switch (primaryService) {
        case 'spotify': {
          const tracks = await Spotify.searchTracks(user.id, query.trim());
          mapped = tracks.map((t) => ({
            id: t.id,
            title: t.name,
            artist: t.artists.map((a) => a.name).join(', '),
            coverUrl: t.album.images[0]?.url ?? '',
            raw: t,
          }));
          break;
        }
        case 'apple_music': {
          const tracks = await AppleMusic.searchTracks(user.id, query.trim());
          mapped = tracks.map((t) => ({
            id: t.id,
            title: t.attributes.name,
            artist: t.attributes.artistName,
            coverUrl: resolveAppleMusicArtwork(t.attributes.artwork.url, 300),
            raw: t,
          }));
          break;
        }
        case 'youtube_music': {
          const tracks = await YouTubeMusic.searchTracks(user.id, query.trim());
          mapped = tracks.map((t) => ({
            id: t.id.videoId,
            title: t.snippet.title,
            artist: t.snippet.channelTitle,
            coverUrl: t.snippet.thumbnails.medium.url,
            raw: t,
          }));
          break;
        }
      }

      setResults(mapped);
    } catch (err) {
      console.error('[ShareModal] search error:', err);
    } finally {
      setSearching(false);
    }
  }, [query, user, primaryService]);

  const handleShare = async (result: SearchResult) => {
    if (!user || !recipient || !primaryService) return;

    setSharing(true);

    try {
      // Resolve the track across all services concurrently
      // Each returns null if the user isn't connected to that service or no match found
      const [spotifyId, appleMusicId, youtubeMusicId] = await Promise.all([
        primaryService === 'spotify'
          ? result.id
          : Spotify.searchTrack(user.id, result.title, result.artist),
        primaryService === 'apple_music'
          ? result.id
          : AppleMusic.searchTrack(user.id, result.title, result.artist),
        primaryService === 'youtube_music'
          ? result.id
          : YouTubeMusic.searchTrack(user.id, result.title, result.artist),
      ]);

      const { error } = await supabase.from('shared_items').insert({
        sender_id: user.id,
        recipient_id: recipient.id,
        type: 'song',
        title: result.title,
        artist: result.artist,
        cover_image_url: result.coverUrl,
        spotify_id: spotifyId,
        apple_music_id: appleMusicId,
        youtube_music_id: youtubeMusicId,
        message: message.trim() || null,
      });

      if (error) throw error;

      Alert.alert('Sent!', `Shared "${result.title}" with ${recipient.display_name}.`);
      onShared();
      handleClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to share. Please try again.');
      console.error('[ShareModal] share error:', err);
    } finally {
      setSharing(false);
    }
  };

  const handleClose = () => {
    setQuery('');
    setResults([]);
    setMessage('');
    onClose();
  };

  const renderResult = ({ item: result }: { item: SearchResult }) => (
    <TouchableOpacity
      style={styles.resultRow}
      onPress={() => handleShare(result)}
      disabled={sharing}
      activeOpacity={0.8}
    >
      {result.coverUrl ? (
        <Image source={{ uri: result.coverUrl }} style={styles.resultCover} />
      ) : (
        <View style={[styles.resultCover, styles.resultCoverPlaceholder]} />
      )}
      <View style={styles.resultInfo}>
        <Text style={styles.resultTitle} numberOfLines={1}>{result.title}</Text>
        <Text style={styles.resultArtist} numberOfLines={1}>{result.artist}</Text>
      </View>
      {sharing ? <ActivityIndicator color="#888" size="small" /> : null}
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Share a Song</Text>
            {recipient && (
              <Text style={styles.headerSubtitle}>to {recipient.display_name}</Text>
            )}
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Optional message */}
        <View style={styles.messageRow}>
          <TextInput
            style={styles.messageInput}
            placeholder="Add a message (optional)"
            placeholderTextColor="#555"
            value={message}
            onChangeText={setMessage}
            maxLength={200}
          />
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder={primaryService ? `Search ${serviceName(primaryService)}…` : 'Search songs…'}
            placeholderTextColor="#555"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          <TouchableOpacity
            style={[styles.searchButton, searching && styles.searchButtonDisabled]}
            onPress={handleSearch}
            disabled={searching}
            activeOpacity={0.8}
          >
            {searching ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Results */}
        <FlatList
          data={results}
          renderItem={renderResult}
          keyExtractor={(r) => r.id}
          style={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !searching ? (
              <Text style={styles.emptyText}>
                {query ? 'No results found' : 'Search for a song to share'}
              </Text>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#888',
    fontSize: 14,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  closeText: {
    color: '#666',
    fontSize: 18,
  },
  messageRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  messageInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.6,
  },
  searchButtonText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  resultCover: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
  },
  resultCoverPlaceholder: {
    backgroundColor: '#2a2a2a',
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  resultArtist: {
    color: '#888',
    fontSize: 13,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 76,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 60,
  },
});
