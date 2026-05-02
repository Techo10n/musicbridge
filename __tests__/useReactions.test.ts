import { act, renderHook, waitFor } from '@testing-library/react-native';

let mockUser: { id: string } | null = { id: 'user-1' };
const mockIn = jest.fn();
const mockSelect = jest.fn(() => ({ in: mockIn }));
const mockUpsert = jest.fn();
const mockFrom = jest.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
  },
}));

describe('useReactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 'user-1' };
    mockIn.mockResolvedValue({ data: [] });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it('loads aggregate reaction counts and the current user reaction', async () => {
    const { useReactions } = require('../hooks/useReactions');
    mockIn.mockResolvedValueOnce({
      data: [
        { id: 'r1', item_id: 'item-1', user_id: 'user-2', emoji: 'like', created_at: '2026-04-30T00:00:00Z' },
        { id: 'r2', item_id: 'item-1', user_id: 'user-1', emoji: 'love', created_at: '2026-04-30T00:00:00Z' },
        { id: 'r3', item_id: 'item-1', user_id: 'user-3', emoji: 'like', created_at: '2026-04-30T00:00:00Z' },
      ],
    });

    const { result } = renderHook(() => useReactions(['item-1']));

    await waitFor(() => {
      expect(result.current.reactions['item-1']).toEqual({ like: 2, love: 1 });
      expect(result.current.myReactions).toEqual({ 'item-1': 'love' });
    });
    expect(mockIn).toHaveBeenCalledWith('item_id', ['item-1']);
  });

  it('does not query or write when there is no signed-in user', async () => {
    const { useReactions } = require('../hooks/useReactions');
    mockUser = null;
    const { result } = renderHook(() => useReactions(['item-1']));

    await act(async () => {
      await result.current.react('item-1', 'like');
    });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(result.current.reactions).toEqual({});
  });

  it('optimistically records a successful reaction', async () => {
    const { useReactions } = require('../hooks/useReactions');
    const { result } = renderHook(() => useReactions(['item-1']));

    await waitFor(() => expect(mockIn).toHaveBeenCalled());
    await act(async () => {
      await result.current.react('item-1', 'like');
    });

    expect(result.current.myReactions).toEqual({ 'item-1': 'like' });
    expect(result.current.reactions['item-1']).toEqual({ like: 1 });
    expect(mockUpsert).toHaveBeenCalledWith(
      { item_id: 'item-1', user_id: 'user-1', emoji: 'like' },
      { onConflict: 'item_id,user_id' },
    );
  });

  it('rolls back the optimistic reaction when the upsert fails', async () => {
    const { useReactions } = require('../hooks/useReactions');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockIn.mockResolvedValueOnce({
      data: [
        { id: 'r1', item_id: 'item-1', user_id: 'user-1', emoji: 'love', created_at: '2026-04-30T00:00:00Z' },
      ],
    });
    mockUpsert.mockRejectedValueOnce(new Error('write failed'));

    const { result } = renderHook(() => useReactions(['item-1']));
    await waitFor(() => expect(result.current.myReactions).toEqual({ 'item-1': 'love' }));

    await act(async () => {
      await result.current.react('item-1', 'like');
    });

    expect(result.current.myReactions).toEqual({ 'item-1': 'love' });
    expect(result.current.reactions['item-1']).toEqual({ love: 1 });
    expect(consoleError).toHaveBeenCalledWith('[useReactions] upsert failed:', expect.any(Error));

    consoleError.mockRestore();
  });
});
