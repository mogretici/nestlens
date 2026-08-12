/**
 * useKeyboardShortcuts Hook Tests
 *
 * Tests for keyboard shortcut handling hooks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboardShortcut, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createKeyboardEvent(
  key: string,
  options: Partial<KeyboardEventInit> = {}
): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
}

function dispatchKeyEvent(
  key: string,
  options: Partial<KeyboardEventInit> = {}
) {
  const event = createKeyboardEvent(key, options);
  document.dispatchEvent(event);
  return event;
}

// ============================================================================
// useKeyboardShortcut Tests
// ============================================================================


// ============================================================================
// useKeyboardShortcuts Tests (Multiple Shortcuts)
// ============================================================================

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles multiple shortcuts', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    renderHook(() => useKeyboardShortcuts([
      { key: 'k', handler: handler1 },
      { key: 'j', handler: handler2 },
    ]));

    dispatchKeyEvent('k');
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    dispatchKeyEvent('j');
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('stops at first matching shortcut', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    // Both handlers for same key
    renderHook(() => useKeyboardShortcuts([
      { key: 'k', handler: handler1 },
      { key: 'k', handler: handler2 },
    ]));

    dispatchKeyEvent('k');

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled(); // Stopped at first match
  });

  it('handles Ctrl shortcuts in list', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    renderHook(() => useKeyboardShortcuts([
      { key: 'k', ctrl: true, handler: handler1 },
      { key: 'k', handler: handler2 },
    ]));

    dispatchKeyEvent('k', { ctrlKey: true });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();

    dispatchKeyEvent('k');
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('handles Meta shortcuts in list', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    renderHook(() => useKeyboardShortcuts([
      { key: 'k', meta: true, handler: handler1 },
      { key: 'k', handler: handler2 },
    ]));

    dispatchKeyEvent('k', { metaKey: true });
    expect(handler1).toHaveBeenCalledTimes(1);

    dispatchKeyEvent('k');
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('handles Escape in inputs for multiple shortcuts', () => {
    const escapeHandler = vi.fn();
    const kHandler = vi.fn();

    renderHook(() => useKeyboardShortcuts([
      { key: 'Escape', handler: escapeHandler },
      { key: 'k', handler: kHandler },
    ]));

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    // Escape should work
    const escEvent = createKeyboardEvent('Escape');
    Object.defineProperty(escEvent, 'target', { value: input });
    document.dispatchEvent(escEvent);
    expect(escapeHandler).toHaveBeenCalledTimes(1);

    // K should not work in input
    const kEvent = createKeyboardEvent('k');
    Object.defineProperty(kEvent, 'target', { value: input });
    document.dispatchEvent(kEvent);
    expect(kHandler).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it('cleans up all listeners on unmount', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const { unmount } = renderHook(() => useKeyboardShortcuts([
      { key: 'k', handler: handler1 },
      { key: 'j', handler: handler2 },
    ]));

    unmount();

    dispatchKeyEvent('k');
    dispatchKeyEvent('j');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('handles combined Ctrl+Shift shortcuts', () => {
    const handler = vi.fn();

    renderHook(() => useKeyboardShortcuts([
      { key: 'k', ctrl: true, shift: true, handler },
    ]));

    // Only Ctrl should not trigger
    dispatchKeyEvent('k', { ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();

    // Only Shift should not trigger
    dispatchKeyEvent('k', { shiftKey: true });
    expect(handler).not.toHaveBeenCalled();

    // Both should trigger
    dispatchKeyEvent('k', { ctrlKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
