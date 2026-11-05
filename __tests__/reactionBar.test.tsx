import { fireEvent, render, screen } from '@testing-library/react-native';
import { ReactionBar } from '../components/ReactionBar';
import { ThemeProvider } from '../lib/theme';

// The system picker is a native view; stand in a plain one that forwards its event.
jest.mock('react-native-emoji-popup', () => {
  const { View } = jest.requireActual('react-native');
  return {
    EmojiPopup: ({ children, onEmojiSelected }: { children: React.ReactNode; onEmojiSelected: (e: string) => void }) => (
      <View testID="emoji-popup" onEmojiSelected={onEmojiSelected}>{children}</View>
    ),
  };
});

const setup = (props: Partial<React.ComponentProps<typeof ReactionBar>> = {}) => {
  const onReact = jest.fn();
  render(
    <ThemeProvider>
      <ReactionBar counts={{}} mine={undefined} onReact={onReact} {...props} />
    </ThemeProvider>,
  );
  return onReact;
};

describe('ReactionBar', () => {
  it('offers to add a reaction when there are none', () => {
    setup();
    expect(screen.getByLabelText('Add a reaction')).toBeTruthy();
  });

  it('shows the top three reactions, most first, and the total', () => {
    setup({ counts: { '😮': 1, '🔥': 4, '🫠': 2, '❤️': 3 } });
    expect(screen.getByText('🔥❤️🫠')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
  });

  it('says when one of them is yours', () => {
    setup({ counts: { '🫠': 1 }, mine: '🫠' });
    expect(screen.getByLabelText('Your reaction 🫠. Change it')).toBeTruthy();
  });

  it('reports whatever the system picker returns, not just a fixed set', () => {
    const onReact = setup();
    fireEvent(screen.getByTestId('emoji-popup'), 'emojiSelected', '🪩');
    expect(onReact).toHaveBeenCalledWith('🪩');
  });
});
