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

const toggle = () => screen.getByTestId('reaction-toggle');
const picker = () => screen.queryByTestId('reaction-picker');

describe('ReactionBar', () => {
  it('starts as one button, with the picker closed', () => {
    setup();
    expect(toggle()).toBeTruthy();
    expect(picker()).toBeNull();
  });

  it('shows the total so the card still says how it landed', () => {
    setup({ counts: { [REACTIONS[0]]: 2, [REACTIONS[1]]: 3 } });
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('wears your own reaction rather than a generic icon', () => {
    setup({ mine: REACTIONS[2] });
    expect(screen.getByText(REACTIONS[2])).toBeTruthy();
  });

  it('opens the picker beside the button, which stays to close it again', () => {
    const onReact = setup();
    fireEvent.press(toggle());
    expect(picker()).toBeTruthy();
    for (const emoji of REACTIONS) expect(screen.getByText(emoji)).toBeTruthy();

    // The button is still there, and tapping it dismisses without reacting.
    fireEvent.press(toggle());
    expect(picker()).toBeNull();
    expect(onReact).not.toHaveBeenCalled();
  });

  it('reports a pick and closes', () => {
    const onReact = setup();
    fireEvent.press(toggle());
    fireEvent.press(screen.getByText(REACTIONS[1]));
    expect(onReact).toHaveBeenCalledWith(REACTIONS[1]);
    expect(picker()).toBeNull();
  });

  it('shows per-reaction counts in the picker only where there is one', () => {
    setup({ counts: { [REACTIONS[0]]: 3 } });
    fireEvent.press(toggle());
    expect(screen.getAllByText('3')).toHaveLength(2); // the button's total and the 🔥 count
    expect(screen.queryByText('0')).toBeNull();
  });
});
