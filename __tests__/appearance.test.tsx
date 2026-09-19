import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text, View, useColorScheme } from 'react-native';
import { ThemeProvider, palettes, useAppearance, useTheme } from '../lib/theme';

jest.mock('react-native/Libraries/Utilities/useColorScheme');
const mockedUseColorScheme = useColorScheme as jest.MockedFunction<typeof useColorScheme>;

/** Shows which palette is live, and lets a test change the preference. */
function Probe() {
  const { colors } = useTheme();
  const { appearance, scheme, setAppearance } = useAppearance();
  return (
    <View>
      <View testID="bg" style={{ backgroundColor: colors.bg }} />
      <Text testID="state">{`${appearance}/${scheme}`}</Text>
      <Text testID="toDark" onPress={() => setAppearance('dark')}>dark</Text>
      <Text testID="toSystem" onPress={() => setAppearance('system')}>system</Text>
    </View>
  );
}

const renderProbe = () => render(<ThemeProvider><Probe /></ThemeProvider>);
const bgOf = (r: ReturnType<typeof renderProbe>) =>
  (r.getByTestId('bg').props.style as { backgroundColor: string }).backgroundColor;

describe('appearance preference', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockedUseColorScheme.mockReturnValue('light');
  });

  it('follows the device when set to system', async () => {
    const r = renderProbe();
    await waitFor(() => expect(r.getByTestId('state')).toHaveTextContent('system/light'));
    expect(bgOf(r)).toBe(palettes.light.bg);

    mockedUseColorScheme.mockReturnValue('dark');
    r.rerender(<ThemeProvider><Probe /></ThemeProvider>);
    await waitFor(() => expect(r.getByTestId('state')).toHaveTextContent('system/dark'));
    expect(bgOf(r)).toBe(palettes.dark.bg);
  });

  it('overrides a light device when the user picks dark, and persists the choice', async () => {
    const r = renderProbe();
    await waitFor(() => expect(r.getByTestId('state')).toHaveTextContent('system/light'));

    await act(async () => { fireEvent.press(r.getByTestId('toDark')); });

    expect(r.getByTestId('state')).toHaveTextContent('dark/dark');
    expect(bgOf(r)).toBe(palettes.dark.bg);
    await waitFor(async () =>
      expect(await AsyncStorage.getItem('museaic_appearance')).toBe('dark'));
  });

  it('restores the stored choice on a cold start', async () => {
    await AsyncStorage.setItem('museaic_appearance', 'dark');
    const r = renderProbe();
    await waitFor(() => expect(r.getByTestId('state')).toHaveTextContent('dark/dark'));
    expect(bgOf(r)).toBe(palettes.dark.bg);
  });

  it('ignores a stored value that is not an appearance', async () => {
    await AsyncStorage.setItem('museaic_appearance', 'sepia');
    const r = renderProbe();
    await waitFor(() => expect(r.getByTestId('state')).toHaveTextContent('system/light'));
  });

  it('going back to system re-follows the device', async () => {
    await AsyncStorage.setItem('museaic_appearance', 'dark');
    const r = renderProbe();
    await waitFor(() => expect(r.getByTestId('state')).toHaveTextContent('dark/dark'));

    await act(async () => { fireEvent.press(r.getByTestId('toSystem')); });

    expect(r.getByTestId('state')).toHaveTextContent('system/light');
    expect(bgOf(r)).toBe(palettes.light.bg);
  });
});
