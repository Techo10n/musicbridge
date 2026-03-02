import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFriends } from '../../hooks/useFriends';
import { FriendListItem } from '../../components/FriendListItem';
import { ShareModal } from '../../components/ShareModal';
import { Friendship, User } from '../../types';

type Tab = 'friends' | 'pending';

export default function Friends() {
  const { friends, pendingRequests, loading, sendFriendRequest, respondToRequest, searchUsers } =
    useFriends();

  const [activeTab, setActiveTab] = useState<Tab>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [shareRecipient, setShareRecipient] = useState<User | null>(null);
  const [shareDone, setShareDone] = useState(0); // counter to trigger refresh if needed

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await searchUsers(searchQuery.trim());
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchUsers]);

  const handleSendRequest = async (user: User) => {
    try {
      await sendFriendRequest(user.id);
      Alert.alert('Request sent', `Friend request sent to @${user.username}`);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not send request');
    }
  };

  const handleAccept = async (friendshipId: string) => {
    try {
      await respondToRequest(friendshipId, 'accepted');
    } catch {
      Alert.alert('Error', 'Could not accept request');
    }
  };

  const handleDecline = async (friendshipId: string) => {
    try {
      await respondToRequest(friendshipId, 'declined');
    } catch {
      Alert.alert('Error', 'Could not decline request');
    }
  };

  const renderSearchResult = ({ item }: { item: User }) => (
    <View style={styles.searchResultRow}>
      <View style={styles.searchResultInfo}>
        <Text style={styles.searchResultName}>{item.display_name}</Text>
        <Text style={styles.searchResultUsername}>@{item.username}</Text>
      </View>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => handleSendRequest(item)}
        activeOpacity={0.8}
      >
        <Text style={styles.addButtonText}>+ Add</Text>
      </TouchableOpacity>
    </View>
  );

  const listData = activeTab === 'friends' ? friends : pendingRequests;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Friends</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username…"
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
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

      {/* Search results */}
      {searchResults.length > 0 && (
        <View style={styles.searchResultsContainer}>
          <FlatList
            data={searchResults}
            renderItem={renderSearchResult}
            keyExtractor={(u) => u.id}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
          onPress={() => setActiveTab('friends')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            Friends {friends.length > 0 && `(${friends.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'pending' && styles.tabTextActive]}>
            Pending {pendingRequests.length > 0 && `(${pendingRequests.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Friend / pending list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={listData}
          renderItem={({ item }: { item: Friendship }) => (
            <FriendListItem
              friendship={item}
              mode={activeTab === 'friends' ? 'friend' : 'pending'}
              onShare={(friend) => setShareRecipient(friend)}
              onAccept={handleAccept}
              onDecline={handleDecline}
            />
          )}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {activeTab === 'friends'
                  ? 'No friends yet — search for users above'
                  : 'No pending requests'}
              </Text>
            </View>
          }
        />
      )}

      <ShareModal
        visible={shareRecipient !== null}
        recipient={shareRecipient}
        onClose={() => setShareRecipient(null)}
        onShared={() => {
          setShareDone((n) => n + 1);
          setShareRecipient(null);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  searchButton: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
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
  searchResultsContainer: {
    backgroundColor: '#1a1a1a',
    marginHorizontal: 16,
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  searchResultUsername: {
    color: '#666',
    fontSize: 12,
    marginTop: 1,
  },
  addButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  addButtonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 3,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#2a2a2a',
  },
  tabText: {
    color: '#555',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: 24,
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 72,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
