import { useEffect, useState } from 'react';
import { getColors } from 'react-native-image-colors';

/**
 * The most prominent color in a cover image, or null until it is known (or if
 * it can't be read), so callers fall back to a theme color. Results are cached
 * in memory by the library, so a cover is only downloaded and sampled once.
 */
export function useCoverColor(uri: string | null | undefined): string | null {
  // Keyed by uri, so a recycled card never shows the previous cover's color.
  const [found, setFound] = useState<{ uri: string; color: string | null } | null>(null);

  useEffect(() => {
    if (!uri) return;
    let live = true;
    getColors(uri, { cache: true, key: uri })
      .then((r) => {
        // iOS's `background` is the prominent edge color; Android and web
        // only offer `dominant`.
        const c = r.platform === 'ios' ? r.background : r.dominant;
        if (live) setFound({ uri, color: c ?? null });
      })
      // A cover that fails to load just keeps the theme stage color.
      .catch(() => {});
    return () => { live = false; };
  }, [uri]);

  return found && found.uri === uri ? found.color : null;
}
