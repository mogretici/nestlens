/**
 * useEntryStream Hook Tests
 *
 * Tests the SSE live-tail hook against a mock EventSource.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntryStream } from '../../hooks/useEntryStream';
import type { Entry } from '../../types';

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  withCredentials: boolean;
  closed = false;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private listeners: Record<string, Array<(e: MessageEvent) => void>> = {};

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (e: MessageEvent) => void): void {
    (this.listeners[type] ||= []).push(cb);
  }
  removeEventListener(type: string, cb: (e: MessageEvent) => void): void {
    this.listeners[type] = (this.listeners[type] || []).filter((c) => c !== cb);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: string): void {
    (this.listeners[type] || []).forEach((cb) => cb({ data } as MessageEvent));
  }
  triggerOpen(): void {
    this.onopen?.(new Event('open'));
  }
  triggerError(): void {
    this.onerror?.(new Event('error'));
  }
}

const last = (): MockEventSource => MockEventSource.instances[MockEventSource.instances.length - 1];

beforeEach(() => {
  MockEventSource.instances = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.stubGlobal('EventSource', MockEventSource as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEntryStream', () => {
  it('opens an EventSource to the stream endpoint', () => {
    renderHook(() => useEntryStream(() => {}));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(last().url).toContain('/__nestlens__/stream');
  });

  it('invokes the callback with the parsed entry on an "entry" event', () => {
    const onEntry = vi.fn();
    renderHook(() => useEntryStream(onEntry));

    const entry: Partial<Entry> = { id: 5, type: 'exception' };
    act(() => last().emit('entry', JSON.stringify(entry)));

    expect(onEntry).toHaveBeenCalledTimes(1);
    expect(onEntry.mock.calls[0][0]).toMatchObject({ id: 5, type: 'exception' });
  });

  it('ignores malformed frames without throwing', () => {
    const onEntry = vi.fn();
    renderHook(() => useEntryStream(onEntry));

    expect(() => act(() => last().emit('entry', 'not-json{'))).not.toThrow();
    expect(onEntry).not.toHaveBeenCalled();
  });

  it('reflects connection status on open and error', () => {
    const { result } = renderHook(() => useEntryStream(() => {}));
    expect(result.current.connected).toBe(false);

    act(() => last().triggerOpen());
    expect(result.current.connected).toBe(true);

    act(() => last().triggerError());
    expect(result.current.connected).toBe(false);
  });

  it('always calls the latest callback (no stale closures)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useEntryStream(cb), {
      initialProps: { cb: first },
    });

    rerender({ cb: second });
    act(() => last().emit('entry', JSON.stringify({ id: 1, type: 'log' })));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useEntryStream(() => {}));
    const source = last();
    unmount();
    expect(source.closed).toBe(true);
  });

  it('does not connect when disabled', () => {
    renderHook(() => useEntryStream(() => {}, false));
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
