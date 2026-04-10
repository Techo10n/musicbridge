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
import { useFollows } from '../../hooks/useFollows';
import { FriendListItem } from '../../components/FriendListItem';
import { ShareModal } from '../../components/ShareModal';
import { UserProfileModal } from '../../components/UserProfileModal';
import { User } from '../../types';

type Tab = 'following' | 'followers';

export default function People() {
  const { following, followers, mutualFollows, loading, followUser, unfollowUser, isFollowing, searchUsers } =
    useFollows();

  const [activeTab, setActiveTab] = useState<Tab>('following');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [shareRecipient, setShareRecipient] = useState<User | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

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

  const handleFollow = async (userId: string) => {
    try {
      await followUser(userId);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not follow user');
    }
  };

  const handleUnfollow = async (userId: string) => {
    try {
      await unfollowUser(userId);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not unfollow user');
    }
  };

  const listData = activeTab === 'following' ? following : followers;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>People</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Find people by username…"
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={(t) => {
            setSearchQuery(t);
            if (!t.trim()) setSearchResults([]);
          }}
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
          {searchResults.map((u) => (
            <View key={u.id}>
              <FriendListItem
                user={u}
                isFollowing={isFollowing(u.id)}
                onFollow={handleFollow}
                onUnfollow={handleUnfollow}
                onViewProfile={(user) => setViewingUserId(user.id)}
              />
            </View>
          ))}
        </View>
      )}

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'following' && styles.tabActive]}
          onPress={() => setActiveTab('following')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}>
            Following{following.length > 0 ? ` ${following.length}` : ''}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'followers' && styles.tabActive]}
          onPress={() => setActiveTab('followers')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, activeTab === 'followers' && styles.tabTextActive]}>
            Followers{followers.length > 0 ? ` ${followers.length}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : (
        <FlatList
          data={listData}
          renderItem={({ item }) => (
            <FriendListItem
              user={item}
              isFollowing={isFollowing(item.id)}
              onFollow={handleFollow}
              onUnfollow={handleUnfollow}
              onShare={(u) => setShareRecipient(u)}
              showShare={mutualFollows.some((m) => m.id === item.id)}
              onViewProfile={(u) => setViewingUserId(u.id)}
            />
          )}
          keyExtractor={(u) => u.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {activeTab === 'following'
                  ? 'Not following anyone yet — search for users above'
                  : 'Nobody following you yet'}
              </Text>
            </View>
          }
        />
      )}

      <ShareModal
        visible={shareRecipient !== null}
        recipient={shareRecipient}
        onClose={() => setShareRecipient(null)}
        onShared={() => setShareRecipient(null)}
      />

      <UserProfileModal
        userId={viewingUserId}
        onClose={() => setViewingUserId(null)}
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
