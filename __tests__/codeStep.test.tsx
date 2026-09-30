import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CodeStep from '../app/(auth)/code';
import { ThemeProvider } from '../lib/theme';
import { ToastProvider } from '../components/ui';

const mockSendEmailCode = jest.fn();
const mockVerifyEmailCode = jest.fn();

jest.mock('../lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ email: 'sam@example.com' }),
}));
jest.mock('../hooks/useAuth', () => ({
  useAuth: () => ({
    sendEmailCode: (...a: unknown[]) => mockSendEmailCode(...a),
    verifyEmailCode: (...a: unknown[]) => mockVerifyEmailCode(...a),
  }),
}));

const setup = () => render(
  <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
    <ThemeProvider>
      <ToastProvider>
        <CodeStep />
      </ToastProvider>
    </ThemeProvider>
  </SafeAreaProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  mockSendEmailCode.mockResolvedValue(undefined);
});

describe('resending the code', () => {
  it('offers to send again', () => {
    setup();
    expect(screen.getByText('Send it again')).toBeTruthy();
  });

  it('replaces the button with a confirmation once the code is on its way', async () => {
    setup();
    fireEvent.press(screen.getByText('Send it again'));

    await waitFor(() => expect(screen.getByText('New code sent')).toBeTruthy());
    // The prompt is gone, so there is nothing inviting a second tap while the
    // first one is still arriving.
    expect(screen.queryByText('Send it again')).toBeNull();
    expect(mockSendEmailCode).toHaveBeenCalledWith('sam@example.com');
  });

  it('goes back to offering after a moment, so a lost email can be resent', async () => {
    jest.useFakeTimers();
    try {
      setup();
      fireEvent.press(screen.getByText('Send it again'));
      await waitFor(() => expect(screen.getByText('New code sent')).toBeTruthy());

      jest.advanceTimersByTime(5000);
      await waitFor(() => expect(screen.getByText('Send it again')).toBeTruthy());
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the button when sending failed, rather than claiming a code was sent', async () => {
    mockSendEmailCode.mockRejectedValue(new Error('rate limited'));
    setup();
    fireEvent.press(screen.getByText('Send it again'));

    await waitFor(() => expect(mockSendEmailCode).toHaveBeenCalled());
    expect(screen.queryByText('New code sent')).toBeNull();
    expect(screen.getByText('Send it again')).toBeTruthy();
  });
});
