import { renderHook, waitFor } from '@testing-library/react-native';
import { useCoverColor } from '../hooks/useCoverColor';

const mockGetColors = jest.fn();
jest.mock('react-native-image-colors', () => ({ getColors: (...a: unknown[]) => mockGetColors(...a) }));

describe('useCoverColor', () => {
  beforeEach(() => mockGetColors.mockReset());

  it("uses iOS's background color, the cover's most prominent one", async () => {
    mockGetColors.mockResolvedValue({ platform: 'ios', background: '#112233', primary: '#ffffff' });
    const { result } = renderHook(() => useCoverColor('https://x/a.jpg'));
    await waitFor(() => expect(result.current).toBe('#112233'));
  });

  it('uses the dominant color on Android', async () => {
    mockGetColors.mockResolvedValue({ platform: 'android', dominant: '#445566', vibrant: '#ff0000' });
    const { result } = renderHook(() => useCoverColor('https://x/b.jpg'));
    await waitFor(() => expect(result.current).toBe('#445566'));
  });

  it('stays null with no cover, or when extraction fails', async () => {
    const none = renderHook(() => useCoverColor(''));
    expect(none.result.current).toBeNull();
    expect(mockGetColors).not.toHaveBeenCalled();

    mockGetColors.mockRejectedValue(new Error('404'));
    const failed = renderHook(() => useCoverColor('https://x/c.jpg'));
    await waitFor(() => expect(mockGetColors).toHaveBeenCalled());
    expect(failed.result.current).toBeNull();
  });
});
