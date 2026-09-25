/**
 * The follow graph is directed, but the app talks about friends. This is the
 * one place that translates between the two, so the People tab, the activity
 * list and anything else name the same state the same way.
 */
import { User } from '../types';

export type Relationship = 'friends' | 'request' | 'pending' | 'none';

export interface FollowGraph {
  /** People this user follows. */
  following: User[];
  /** People who follow this user. */
  followers: User[];
}

export interface FriendLists {
  /** Both directions. The only people you can send to. */
  friends: User[];
  /** They added you, you have not added back. An incoming request. */
  requests: User[];
  /** You added them, they have not added back. Nothing to do but wait. */
  pending: User[];
}

export function splitFollowGraph({ following, followers }: FollowGraph): FriendLists {
  const followerIds = new Set(followers.map((u) => u.id));
  const followingIds = new Set(following.map((u) => u.id));

  return {
    friends: following.filter((u) => followerIds.has(u.id)),
    requests: followers.filter((u) => !followingIds.has(u.id)),
    pending: following.filter((u) => !followerIds.has(u.id)),
  };
}

export function relationshipFor(id: string, lists: FriendLists): Relationship {
  if (lists.friends.some((u) => u.id === id)) return 'friends';
  if (lists.requests.some((u) => u.id === id)) return 'request';
  if (lists.pending.some((u) => u.id === id)) return 'pending';
  return 'none';
}

/** What the button on a person's row should say. */
export function actionLabelFor(relationship: Relationship): string {
  switch (relationship) {
    case 'friends': return 'Friends';
    case 'request': return 'Add back';
    case 'pending': return 'Waiting';
    case 'none': return 'Add';
  }
}
