import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactionBar, REACTIONS } from '../components/ReactionBar';
import { ThemeProvider } from '../lib/theme';

const setup = (props: Partial<React.ComponentProps<typeof ReactionBar>> = {}) => {
  const onReact = jest.fn();
  render(
    <ThemeProvider>
      <ReactionBar counts={{}} mine={undefined} onReact={onReact} {...props} />
    </ThemeProvider>,
  );
  return onReact;
};

describe('ReactionBar, expanded', () => {
  it('shows every reaction at once', () => {
    setup();
    for (const emoji of REACTIONS) expect(screen.getByText(emoji)).toBeTruthy();
  });

  it('reports a tap', () => {
    const onReact = setup();
    fireEvent.press(screen.getByText(REACTIONS[0]));
    expect(onReact).toHaveBeenCalledWith(REACTIONS[0]);
  });

  it('shows a count only where there is one', () => {
    setup({ counts: { [REACTIONS[0]]: 3 } });
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByText('0')).toBeNull();
  });
});

describe('ReactionBar, collapsed', () => {
  it('offers one button instead of a row', () => {
    setup({ collapsed: true });
    expect(screen.getByTestId('reaction-toggle')).toBeTruthy();
    expect(screen.queryByText(REACTIONS[1])).toBeNull();
  });

  it('shows the total so the card still says how it landed', () => {
    setup({ collapsed: true, counts: { [REACTIONS[0]]: 2, [REACTIONS[1]]: 3 } });
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('wears your own reaction rather than a generic icon', () => {
    setup({ collapsed: true, mine: REACTIONS[2] });
    expect(screen.getByText(REACTIONS[2])).toBeTruthy();
  });

  it('expands to the full set on tap, and collapses once you pick', () => {
    const onReact = setup({ collapsed: true });
    fireEvent.press(screen.getByTestId('reaction-toggle'));
    for (const emoji of REACTIONS) expect(screen.getByText(emoji)).toBeTruthy();

    fireEvent.press(screen.getByText(REACTIONS[1]));
    expect(onReact).toHaveBeenCalledWith(REACTIONS[1]);
    expect(screen.queryByText(REACTIONS[3])).toBeNull();
  });
});
