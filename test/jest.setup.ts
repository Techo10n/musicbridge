import '@testing-library/react-native';

// AsyncStorage has no native module under Jest. The package ships a mock for
// exactly this; the factory must use require() because jest.mock is hoisted
// above imports.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
