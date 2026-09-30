import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SortMenu } from '../components/ui/SortMenu';
import { ThemeProvider } from '../lib/theme';

const OPTIONS = [
  { id: 'recent', label: 'Recent' },
  { id: 'name', label: 'A–Z' },
  { id: 'count', label: 'Most songs' },
] as const;

const setup = (value: 'recent' | 'name' | 'count' = 'recent', onChange = jest.fn()) => {
  render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
      <ThemeProvider>
        <SortMenu value={value} options={OPTIONS} onChange={onChange} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return onChange;
};

describe('SortMenu', () => {
  it('shows the current sort, so the button says what it does', () => {
    setup('name');
    expect(screen.getByText('A–Z')).toBeTruthy();
  });

  it('keeps the options out of the way until asked for', () => {
    setup();
    expect(screen.queryByText('Most songs')).toBeNull();
  });

  it('opens the list on press', () => {
    setup();
    fireEvent.press(screen.getByTestId('sort-trigger'));
    expect(screen.getByText('Most songs')).toBeTruthy();
  });

  it('reports the choice and closes', async () => {
    const onChange = setup('recent');
    fireEvent.press(screen.getByTestId('sort-trigger'));
    fireEvent.press(screen.getByText('Most songs'));

    // Reported immediately, so the list re-sorts behind the closing sheet.
    expect(onChange).toHaveBeenCalledWith('count');
    // The sheet outlives the tap by one exit animation, then unmounts.
    await waitFor(() => expect(screen.queryByText('A\u2013Z')).toBeNull());
  });

  it('marks which option is active, so the list is not a guess', () => {
    setup('name');
    fireEvent.press(screen.getByTestId('sort-trigger'));
    expect(screen.getByTestId('sort-option-name-active')).toBeTruthy();
    expect(screen.queryByTestId('sort-option-recent-active')).toBeNull();
  });
});
