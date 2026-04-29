// MusicBridge design tokens — warm dark palette with bluish-purple accent
export const colors = {
  // Backgrounds
  bg: '#1a1813',
  bgElev: '#201d18',
  bgCard: '#26221d',
  bgInput: '#2c2822',

  // Borders
  line: '#332e28',
  line2: '#3e3932',

  // Text
  fg: '#f5f0e8',
  fg2: '#c8bfb0',
  fg3: '#8a8075',
  fg4: '#5a5248',

  // Primary accent — bluish-purple
  primary: '#7C5BF4',
  primaryLight: '#9b80f8',
  primaryInk: '#f5f3ff',

  // Secondary accents
  coral: '#e8704a',
  violet: '#9b70e8',

  // Service brand colors (used for dots/badges only)
  spotify: '#1DB954',
  appleMusic: '#fc3c44',
  youtubeMusic: '#FF0000',
} as const;

// Common border radius values
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
