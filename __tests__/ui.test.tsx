import { act, fireEvent, render } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import {
  Button, Chip, EmptyState, SegmentedTabs, ServiceDot, TasteBar, ToastProvider, useToast, initialsFor,
} from '../components/ui';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { ThemeProvider, getTheme, makeStyles, palettes } from '../lib/theme';

/** Mirrors the app root: anything reading safe-area insets needs this. */
const metrics = initialWindowMetrics ?? {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider initialMetrics={metrics}>{children}</SafeAreaProvider>;
}

describe('theme', () => {
  it('defines every token in both palettes', () => {
    const lightKeys = Object.keys(palettes.light).sort();
    const darkKeys = Object.keys(palettes.dark).sort();
    expect(darkKeys).toEqual(lightKeys);
    for (const key of lightKeys) {
      expect(palettes.light[key as keyof typeof palettes.light]).toMatch(/^(#|rgba\()/);
    }
  });

  it('makeStyles builds one sheet per scheme and reuses it', () => {
    const factory = jest.fn(({ colors }) => ({ box: { backgroundColor: colors.bg } }));
    const useStyles = makeStyles(factory);
    const Probe = () => { const s = useStyles(); return <View testID="box" style={s.box} />; };

    const light = render(<ThemeProvider scheme="light"><Probe /></ThemeProvider>);
    light.rerender(<ThemeProvider scheme="light"><Probe /></ThemeProvider>);
    expect(light.getByTestId('box').props.style).toEqual({ backgroundColor: getTheme('light').colors.bg });

    const dark = render(<ThemeProvider scheme="dark"><Probe /></ThemeProvider>);
    expect(dark.getByTestId('box').props.style).toEqual({ backgroundColor: getTheme('dark').colors.bg });
    expect(factory).toHaveBeenCalledTimes(2);
  });
});

describe('initialsFor', () => {
  it('takes the first letter of up to two words', () => {
    expect(initialsFor('Sam Lee')).toBe('SL');
    expect(initialsFor('  zech ')).toBe('Z');
    expect(initialsFor('')).toBe('?');
    expect(initialsFor(undefined)).toBe('?');
  });
});

describe('ServiceDot', () => {
  it('uses service brand color for known services', () => {
    const { UNSAFE_getByType } = render(<ServiceDot service="spotify" size={10} />);
    expect(UNSAFE_getByType(View).props.style).toEqual(expect.objectContaining({
      width: 10, height: 10, borderRadius: 5, backgroundColor: palettes.light.spotify,
    }));
  });

  it('falls back to a neutral for unknown services', () => {
    const { UNSAFE_getByType } = render(<ServiceDot service="tidal" />);
    expect(UNSAFE_getByType(View).props.style.backgroundColor).toBe(palettes.light.text3);
  });
});

describe('Chip', () => {
  it('renders static chips without press behavior', () => {
    const { getByText } = render(<Chip label="Songs" />);
    expect(getByText('Songs')).toBeTruthy();
  });

  it('calls onPress for interactive chips', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Playlists" onPress={onPress} />);
    fireEvent.press(getByText('Playlists'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Button', () => {
  it('fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button label="Send" onPress={onPress} />);
    fireEvent.press(getByText('Send'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while loading and hides the label', () => {
    const onPress = jest.fn();
    const { queryByText, getByRole } = render(<Button label="Send" onPress={onPress} loading />);
    expect(queryByText('Send')).toBeNull();
    fireEvent.press(getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('SegmentedTabs', () => {
  const tabs = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Beta', count: 3 }] as const;

  it('reports the tapped tab and shows counts', () => {
    const onChange = jest.fn();
    const { getByText } = render(<SegmentedTabs tabs={tabs} value="a" onChange={onChange} />);
    fireEvent.press(getByText(/Beta/));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(getByText('  3')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders title, body, and a working action', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <EmptyState icon="people-outline" title="No one yet" body="Invite a friend." action={{ label: 'Invite', onPress }} />,
    );
    expect(getByText('No one yet')).toBeTruthy();
    expect(getByText('Invite a friend.')).toBeTruthy();
    fireEvent.press(getByText('Invite'));
    expect(onPress).toHaveBeenCalled();
  });
});

describe('Toast', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <Text onPress={() => toast.show({ message: 'Sent to Sam', action: { label: 'View', onPress: () => {} } })}>
        go
      </Text>
    );
  }

  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('shows a message with its action, then auto-dismisses', () => {
    const { getByText, queryByText } = render(
      <Screen><ToastProvider><Trigger /></ToastProvider></Screen>,
    );
    fireEvent.press(getByText('go'));
    expect(getByText('Sent to Sam')).toBeTruthy();
    expect(getByText('View')).toBeTruthy();
    act(() => { jest.advanceTimersByTime(5100); });
    expect(queryByText('Sent to Sam')).toBeNull();
  });
});

describe('TasteBar', () => {
  it('clamps negative percentages to zero width', () => {
    const { UNSAFE_getAllByType } = render(<TasteBar pct={-20} />);
    const fill = UNSAFE_getAllByType(View)[1];
    expect(fill.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '0%' })]));
  });

  it('clamps percentages above 100 to full width', () => {
    const { UNSAFE_getAllByType } = render(<TasteBar pct={180} />);
    const fill = UNSAFE_getAllByType(View)[1];
    expect(fill.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ width: '100%' })]));
  });
});
