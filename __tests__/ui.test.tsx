import { fireEvent, render } from '@testing-library/react-native';
import { View } from 'react-native';
import { Chip, ServiceDot, TasteBar, serviceLabelShort } from '../components/ui';

describe('serviceLabelShort', () => {
  it('formats known service ids and leaves unknown values alone', () => {
    expect(serviceLabelShort('spotify')).toBe('Spotify');
    expect(serviceLabelShort('apple_music')).toBe('Apple Music');
    expect(serviceLabelShort('youtube_music')).toBe('YT Music');
    expect(serviceLabelShort('tidal')).toBe('tidal');
  });
});

describe('ServiceDot', () => {
  it('uses service brand color for known services', () => {
    const { UNSAFE_getByType } = render(<ServiceDot service="spotify" size={10} />);
    expect(UNSAFE_getByType(View).props.style).toEqual(expect.objectContaining({
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#1DB954',
    }));
  });
});

describe('Chip', () => {
  it('renders static chips without press behavior', () => {
    const { getByText } = render(<Chip label="Songs" />);
    expect(getByText('Songs')).toBeTruthy();
  });

  it('calls onPress for interactive chips', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Chip label="Reels" onPress={onPress} />);

    fireEvent.press(getByText('Reels'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('TasteBar', () => {
  it('clamps negative percentages to zero width', () => {
    const { UNSAFE_getAllByType } = render(<TasteBar pct={-20} />);
    const fill = UNSAFE_getAllByType(View)[1];
    expect(fill.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: '0%' }),
    ]));
  });

  it('clamps percentages above 100 to full width', () => {
    const { UNSAFE_getAllByType } = render(<TasteBar pct={180} />);
    const fill = UNSAFE_getAllByType(View)[1];
    expect(fill.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ width: '100%' }),
    ]));
  });
});
