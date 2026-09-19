/**
 * Museaic design tokens and theme runtime.
 *
 * One bold accent, warm neutrals, a display serif for anything that carries
 * the brand voice, and the system face for everything you read. Light is the
 * default; dark follows the system appearance. Nothing outside this file may
 * name a hex color — screens consume `useTheme()` / `makeStyles()`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextStyle, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MusicService } from '../types';

export type Scheme = 'light' | 'dark';

export interface Palette {
  /** Page background. */
  bg: string;
  /** Raised chrome: tab bar, sheets, app bars that need separation. */
  bgElev: string;
  /** Cards and list groups. */
  surface: string;
  /** Inputs, chips, and secondary fills sitting on a surface. */
  surfaceAlt: string;
  line: string;
  lineStrong: string;
  text: string;
  text2: string;
  text3: string;
  text4: string;
  accent: string;
  /** Text and icons placed on an accent fill. */
  accentInk: string;
  /** Tinted accent wash for selected/unread states. */
  accentSoft: string;
  accentBorder: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  /** Scrim behind sheets and dialogs. */
  overlay: string;
  /** Skeleton shimmer base. */
  skeleton: string;
  /**
   * Ink for content sitting on a fill that stays dark or saturated in *both*
   * schemes: service brand colors, a photo scrim, a switch knob. Using `text`
   * here would flip to near-black in light mode and vanish.
   */
  brandInk: string;
  toastBg: string;
  toastText: string;
  toastAction: string;
  spotify: string;
  appleMusic: string;
  youtubeMusic: string;
}

const brand = {
  spotify: '#1DB954',
  appleMusic: '#FC3C44',
  youtubeMusic: '#FF0000',
} as const;

export const palettes: Record<Scheme, Palette> = {
  light: {
    bg: '#FAF7F1',
    bgElev: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F1ECE2',
    line: '#E7E0D4',
    lineStrong: '#D2C9BA',
    text: '#17140F',
    text2: '#4A443B',
    text3: '#7E766A',
    text4: '#B1A899',
    accent: '#5B3DF5',
    accentInk: '#FFFFFF',
    accentSoft: 'rgba(91, 61, 245, 0.10)',
    accentBorder: 'rgba(91, 61, 245, 0.35)',
    danger: '#D64B2A',
    dangerSoft: 'rgba(214, 75, 42, 0.10)',
    success: '#1E9E5A',
    warning: '#C98A12',
    overlay: 'rgba(23, 20, 15, 0.55)',
    skeleton: '#ECE6DB',
    brandInk: '#FFFFFF',
    toastBg: '#17140F',
    toastText: '#FAF7F1',
    toastAction: '#B9A8FF',
    ...brand,
  },
  dark: {
    bg: '#15130F',
    bgElev: '#1D1A15',
    surface: '#232019',
    surfaceAlt: '#2C2820',
    line: '#332E26',
    lineStrong: '#433D33',
    text: '#F5F0E8',
    text2: '#C9C0B1',
    text3: '#8C8376',
    text4: '#5C5449',
    accent: '#9B80F8',
    accentInk: '#120F1F',
    accentSoft: 'rgba(155, 128, 248, 0.14)',
    accentBorder: 'rgba(155, 128, 248, 0.40)',
    danger: '#F07A57',
    dangerSoft: 'rgba(240, 122, 87, 0.14)',
    success: '#3FC47C',
    warning: '#E2A63A',
    overlay: 'rgba(0, 0, 0, 0.62)',
    skeleton: '#2C2820',
    brandInk: '#FFFFFF',
    toastBg: '#2C2820',
    toastText: '#F5F0E8',
    toastAction: '#9B80F8',
    ...brand,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Font family names as registered by `@expo-google-fonts/fraunces`. */
export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayItalic: 'Fraunces_500Medium_Italic',
} as const;

/**
 * Type scale. Display styles carry the brand; everything else is the system
 * face so body copy stays native and fast.
 */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
  title1: { fontFamily: fonts.display, fontSize: 26, lineHeight: 30, letterSpacing: -0.4 },
  title2: { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  callout: { fontSize: 14, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  captionStrong: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
} as const satisfies Record<string, TextStyle>;

export const elevation = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sheet: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 20,
  },
  toast: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 12,
  },
} as const;

export interface Theme {
  scheme: Scheme;
  colors: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
  fonts: typeof fonts;
  elevation: typeof elevation;
  /** `true` when the palette is dark — for icons and status bars. */
  isDark: boolean;
}

const themes: Record<Scheme, Theme> = {
  light: { scheme: 'light', colors: palettes.light, spacing, radius, type, fonts, elevation, isDark: false },
  dark: { scheme: 'dark', colors: palettes.dark, spacing, radius, type, fonts, elevation, isDark: true },
};

export function getTheme(scheme: Scheme): Theme {
  return themes[scheme];
}

export function serviceColor(colors: Palette, service: MusicService | string | null | undefined): string {
  switch (service) {
    case 'spotify': return colors.spotify;
    case 'apple_music': return colors.appleMusic;
    case 'youtube_music': return colors.youtubeMusic;
    default: return colors.text3;
  }
}

/** What the user chose in Settings. `system` defers to the device. */
export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_OPTIONS: readonly { id: Appearance; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
] as const;

const APPEARANCE_KEY = 'museaic_appearance';

function isAppearance(value: unknown): value is Appearance {
  return value === 'system' || value === 'light' || value === 'dark';
}

interface AppearanceApi {
  /** The user's choice, which may be `system`. */
  appearance: Appearance;
  /** The palette actually in use once `system` is resolved. */
  scheme: Scheme;
  setAppearance: (next: Appearance) => void;
  /** False until the stored choice has been read back. */
  ready: boolean;
}

const ThemeContext = createContext<Theme>(themes.light);
const AppearanceContext = createContext<AppearanceApi>({
  appearance: 'system',
  scheme: 'light',
  setAppearance: () => {},
  ready: true,
});

/**
 * Resolves the palette from the user's stored choice, falling back to the
 * system appearance. `scheme` pins a palette outright for previews and tests.
 */
export function ThemeProvider({ children, scheme }: { children: React.ReactNode; scheme?: Scheme }) {
  const system = useColorScheme();
  const [appearance, setAppearanceState] = useState<Appearance>('system');
  const [ready, setReady] = useState(false);

  // Read the stored choice once. Until it lands the system appearance applies,
  // which is also the default, so there is no flash for the common case.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(APPEARANCE_KEY);
        if (!cancelled && isAppearance(stored)) setAppearanceState(stored);
      } catch (err) {
        console.warn('[theme] could not read the stored appearance:', err);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    setAppearanceState(next);
    AsyncStorage.setItem(APPEARANCE_KEY, next).catch((err) =>
      console.warn('[theme] could not save the appearance:', err),
    );
  }, []);

  const resolved: Scheme = scheme
    ?? (appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance);

  const theme = useMemo(() => themes[resolved], [resolved]);
  const api = useMemo<AppearanceApi>(
    () => ({ appearance, scheme: resolved, setAppearance, ready }),
    [appearance, resolved, setAppearance, ready],
  );

  return (
    <AppearanceContext.Provider value={api}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </AppearanceContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Read and change the light/dark preference. See the Appearance row in Settings. */
export function useAppearance(): AppearanceApi {
  return useContext(AppearanceContext);
}

/**
 * Builds a `useStyles()` hook from a theme-aware factory. Styles are created
 * once per scheme and shared, so calling the hook is as cheap as reading a
 * module-level `StyleSheet`.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<Scheme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let sheet = cache.get(theme.scheme);
    if (!sheet) {
      sheet = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, sheet);
    }
    return sheet;
  };
}
