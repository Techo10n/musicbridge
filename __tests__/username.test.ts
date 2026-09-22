/**
 * Mirrors the rules migration 014 enforces in the database, so the field can
 * reject a bad username before a round trip.
 */
const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function sanitize(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

describe('username sanitize', () => {
  it('lowercases and drops characters a username may not contain', () => {
    expect(sanitize('Zech Frierson!')).toBe('zechfrierson');
    expect(sanitize('a.b-c@d')).toBe('abcd');
    expect(sanitize('keeps_underscores_9')).toBe('keeps_underscores_9');
  });

  it('caps length at twenty so the field cannot hold an invalid value', () => {
    expect(sanitize('x'.repeat(40))).toHaveLength(20);
  });

  it('is idempotent', () => {
    const once = sanitize('Zech Frierson!');
    expect(sanitize(once)).toBe(once);
  });
});

describe('username rules', () => {
  it('accepts what the database accepts', () => {
    for (const ok of ['zech', 'abc', 'a_b_9', 'x'.repeat(20)]) {
      expect(USERNAME_RE.test(ok)).toBe(true);
    }
  });

  it('rejects too short, too long, and the placeholder shape with capitals', () => {
    for (const bad of ['ab', 'x'.repeat(21), 'Zech', 'has space', 'dot.dot', '']) {
      expect(USERNAME_RE.test(bad)).toBe(false);
    }
  });

  it('accepts the placeholder the trigger generates, so it never blocks the form', () => {
    expect(USERNAME_RE.test('user_a3f2b9c81d04')).toBe(true);
  });
});
