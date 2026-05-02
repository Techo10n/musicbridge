import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { parseReelUrl } from '../lib/reelParser';

type PendingSource = 'clipboard' | 'link';

function extractSharedTextParam(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function extractReelFromIncomingUrl(incomingUrl: string): string | null {
  const directMatch = parseReelUrl(incomingUrl);
  if (directMatch) return directMatch.originalUrl;

  const parsed = Linking.parse(incomingUrl);
  const candidates = [
    parsed.path,
    extractSharedTextParam(parsed.queryParams?.url),
    extractSharedTextParam(parsed.queryParams?.reelUrl),
    extractSharedTextParam(parsed.queryParams?.text),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const reel = parseReelUrl(candidate);
    if (reel) return reel.originalUrl;
  }

  return null;
}

/**
 * Watches for reel URLs from either the clipboard or inbound app links.
 *
 * Clipboard detection fires on app mount and every time the app returns to the
 * foreground. Inbound links support flows like:
 *   museaic://import-reel?url=<encoded reel url>
 *   museaic://import-reel?text=<shared text containing a reel url>
 */
export function useClipboardReel(scopeKey?: string | null, enabled = true) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<PendingSource | null>(null);
  const incomingUrl = Linking.useURL();
  const seenUrls = useRef(new Set<string>());

  const surfaceUrl = (url: string, source: PendingSource) => {
    if (seenUrls.current.has(url)) return;
    setPendingUrl(url);
    setPendingSource(source);
  };

  const checkClipboard = async () => {
    if (!enabled) return;
    try {
      const text = (await Clipboard.getStringAsync()).trim();
      if (!text) return;
      const parsed = parseReelUrl(text);
      if (!parsed) return;
      surfaceUrl(parsed.originalUrl, 'clipboard');
    } catch {
      // Clipboard permission denied or unavailable — fail silently
    }
  };

  useEffect(() => {
    if (!enabled) return;
    checkClipboard();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkClipboard();
    });

    return () => sub.remove();
  }, [enabled]);

  useEffect(() => {
    if (!incomingUrl) return;
    const reelUrl = extractReelFromIncomingUrl(incomingUrl);
    if (!reelUrl) return;
    surfaceUrl(reelUrl, 'link');
  }, [incomingUrl]);

  useEffect(() => {
    if (!enabled) {
      seenUrls.current.clear();
      setPendingUrl(null);
      setPendingSource(null);
      return;
    }
    seenUrls.current.clear();
    setPendingUrl(null);
    setPendingSource(null);
  }, [enabled, scopeKey]);

  /** Dismiss the banner without processing the URL. */
  const dismiss = () => {
    if (pendingUrl) {
      seenUrls.current.add(pendingUrl);
    }
    setPendingUrl(null);
    setPendingSource(null);
  };

  return { pendingUrl, pendingSource, dismiss };
}
