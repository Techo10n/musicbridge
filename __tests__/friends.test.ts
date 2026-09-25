import { actionLabelFor, relationshipFor, splitFollowGraph } from '../lib/friends';
import { User } from '../types';

const person = (id: string): User => ({
  id,
  username: id,
  display_name: id.toUpperCase(),
  avatar_url: null,
  bio: null,
  favorite_song: null,
  primary_service: null,
  created_at: '2026-01-01T00:00:00Z',
});

const [sam, ash, rio, mina] = [person('sam'), person('ash'), person('rio'), person('mina')];

describe('splitFollowGraph', () => {
  it('calls it friends only when both directions exist', () => {
    const lists = splitFollowGraph({ following: [sam, ash], followers: [sam, rio] });
    expect(lists.friends.map((u) => u.id)).toEqual(['sam']);
  });

  it('treats someone who added you first as a request', () => {
    const lists = splitFollowGraph({ following: [sam], followers: [sam, rio] });
    expect(lists.requests.map((u) => u.id)).toEqual(['rio']);
  });

  it('treats someone you added first as waiting', () => {
    const lists = splitFollowGraph({ following: [sam, ash], followers: [sam] });
    expect(lists.pending.map((u) => u.id)).toEqual(['ash']);
  });

  it('puts every edge in exactly one bucket', () => {
    const lists = splitFollowGraph({ following: [sam, ash], followers: [sam, rio] });
    const all = [...lists.friends, ...lists.requests, ...lists.pending].map((u) => u.id);
    expect(all.sort()).toEqual(['ash', 'rio', 'sam']);
    expect(new Set(all).size).toBe(all.length);
  });

  it('handles an empty graph without inventing anyone', () => {
    const lists = splitFollowGraph({ following: [], followers: [] });
    expect(lists).toEqual({ friends: [], requests: [], pending: [] });
  });
});

describe('relationshipFor', () => {
  const lists = splitFollowGraph({ following: [sam, ash], followers: [sam, rio] });

  it('names each state', () => {
    expect(relationshipFor('sam', lists)).toBe('friends');
    expect(relationshipFor('rio', lists)).toBe('request');
    expect(relationshipFor('ash', lists)).toBe('pending');
    expect(relationshipFor(mina.id, lists)).toBe('none');
  });
});

describe('actionLabelFor', () => {
  it('says what the button does, in friends language', () => {
    expect(actionLabelFor('none')).toBe('Add');
    expect(actionLabelFor('request')).toBe('Add back');
    expect(actionLabelFor('pending')).toBe('Waiting');
    expect(actionLabelFor('friends')).toBe('Friends');
  });
});
