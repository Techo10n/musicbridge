const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockInvoke = jest.fn();
let mockIsDevice = true;

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockIsDevice;
  },
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { MAX: 5 },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      upsert: mockUpsert,
      delete: mockDelete,
    })),
    functions: {
      invoke: mockInvoke,
    },
  },
}));

describe('notifications', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockIsDevice = true;
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockReturnValue({ eq: mockEq });
  });

  it('returns null on simulators or unsupported devices', async () => {
    mockIsDevice = false;
    const { registerForPushNotifications } = require('../lib/notifications');

    await expect(registerForPushNotifications('user-1')).resolves.toBeNull();
  });

  it('requests permission, stores the token, and returns it', async () => {
    jest.resetModules();
    const notifications = require('expo-notifications');
    const { Platform } = require('react-native');
    const { registerForPushNotifications } = require('../lib/notifications');

    (notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
    (notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
    (notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockUpsert.mockResolvedValue({ error: null });
    Platform.OS = 'ios';

    await expect(registerForPushNotifications('user-1')).resolves.toBe('ExponentPushToken[abc]');

    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'user-1', token: 'ExponentPushToken[abc]', platform: 'ios' },
      { onConflict: 'user_id,token' },
    );
  });

  it('returns null when notification permission is denied', async () => {
    const notifications = require('expo-notifications');
    const { registerForPushNotifications } = require('../lib/notifications');

    (notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
    (notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });

    await expect(registerForPushNotifications('user-1')).resolves.toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('unregisters the current device token best-effort', async () => {
    const notifications = require('expo-notifications');
    const { unregisterPushToken } = require('../lib/notifications');

    (notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExponentPushToken[abc]' });

    await unregisterPushToken('user-1');

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockEq).toHaveBeenCalledWith('token', 'ExponentPushToken[abc]');
  });

  it('invokes the send-notification edge function without throwing', async () => {
    const { sendPushNotification } = require('../lib/notifications');
    mockInvoke.mockResolvedValue({ data: null, error: null });

    await expect(sendPushNotification('recipient-1', 'new_share', 'share-1')).resolves.toBeUndefined();

    expect(mockInvoke).toHaveBeenCalledWith('send-notification', {
      body: {
        notification_type: 'new_share',
        recipient_id: 'recipient-1',
        shared_item_id: 'share-1',
      },
    });
  });
});
