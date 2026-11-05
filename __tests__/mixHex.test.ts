import { mixHex } from '../lib/theme';

describe('mixHex', () => {
  it('weights the first color by t', () => {
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#ffffff');
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080');
  });

  it('accepts shorthand and either case', () => {
    expect(mixHex('#F00', '#00f', 0.5)).toBe('#800080');
  });

  it('falls back to the second color when the first is not a hex', () => {
    expect(mixHex('rgb(1,2,3)', '#123456', 0.6)).toBe('#123456');
  });
});
