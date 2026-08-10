import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../types';
import { nestlensUrl } from '../basePath';

/** NestLens Server-Sent Events endpoint (same origin as the API). */
function getStreamUrl(): string {
  return nestlensUrl('/stream');
}

export interface UseEntryStreamResult {
  /** Whether the live SSE connection is currently open. */
  connected: boolean;
}

/**
 * Subscribe to the NestLens real-time entry stream (SSE).
 *
 * Invokes `onEntry` for every entry pushed by the server. The latest callback
 * is always used (no stale closures), and the browser's EventSource handles
 * automatic reconnection. Returns the live connection status.
 */
export function useEntryStream(
  onEntry: (entry: Entry) => void,
  enabled = true,
): UseEntryStreamResult {
  const callbackRef = useRef(onEntry);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    callbackRef.current = onEntry;
  }, [onEntry]);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(getStreamUrl(), { withCredentials: true });

    const handleEntry = (event: MessageEvent): void => {
      try {
        callbackRef.current(JSON.parse(event.data) as Entry);
      } catch {
        // Ignore malformed frames
      }
    };

    source.addEventListener('entry', handleEntry as EventListener);
    source.onopen = (): void => setConnected(true);
    // EventSource reconnects on its own; just reflect the dropped state.
    source.onerror = (): void => setConnected(false);

    return () => {
      source.removeEventListener('entry', handleEntry as EventListener);
      source.close();
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
