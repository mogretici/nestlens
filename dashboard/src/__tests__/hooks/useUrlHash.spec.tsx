/**
 * useUrlHash Hook Tests
 *
 * Tests for URL hash state management hooks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUrlHash, useUrlHashState } from '../../hooks/useUrlHash';

// ============================================================================
// TEST SETUP
// ============================================================================

// Type for test tabs
type TestTab = 'overview' | 'details' | 'other';

beforeEach(() => {
  // Reset location hash before each test
  window.history.replaceState(null, '', window.location.pathname);
});

// ============================================================================
// useUrlHash Tests
// ============================================================================

describe('useUrlHash', () => {
  describe('Initialization', () => {
    it('returns default value when no hash exists', () => {
      const { result } = renderHook(() => useUrlHash('tab', 'overview'));

      expect(result.current[0]).toBe('overview');
    });

    it('returns value from hash when it exists', () => {
      window.history.replaceState(null, '', '#tab=details');

      const { result } = renderHook(() => useUrlHash('tab', 'overview'));

      expect(result.current[0]).toBe('details');
    });

    it('returns default when key not found in hash', () => {
      window.history.replaceState(null, '', '#other=value');

      const { result } = renderHook(() => useUrlHash('tab', 'overview'));

      expect(result.current[0]).toBe('overview');
    });

    it('handles complex hash with multiple params', () => {
      window.history.replaceState(null, '', '#tab=details&section=main');

      const { result } = renderHook(() => useUrlHash('tab', 'overview'));

      expect(result.current[0]).toBe('details');
    });
  });

  describe('setValue', () => {
    it('updates state when setValue is called', () => {
      const { result } = renderHook(() => useUrlHash<TestTab>('tab', 'overview'));

      act(() => {
        result.current[1]('details');
      });

      expect(result.current[0]).toBe('details');
    });

    it('updates URL hash when setValue is called', () => {
      const { result } = renderHook(() => useUrlHash<TestTab>('tab', 'overview'));

      act(() => {
        result.current[1]('details');
      });

      expect(window.location.hash).toBe('#tab=details');
    });

    it('removes hash key when set to default value', () => {
      window.history.replaceState(null, '', '#tab=details');

      const { result } = renderHook(() => useUrlHash('tab', 'overview'));

      act(() => {
        result.current[1]('overview');
      });

      expect(result.current[0]).toBe('overview');
      // Hash should be empty when only default value
      expect(window.location.hash).toBe('');
    });

    it('preserves other hash params when updating', () => {
      window.history.replaceState(null, '', '#other=value');

      const { result } = renderHook(() => useUrlHash<TestTab>('tab', 'overview'));

      act(() => {
        result.current[1]('details');
      });

      expect(window.location.hash).toContain('tab=details');
      expect(window.location.hash).toContain('other=value');
    });
  });

  describe('Hash Change Events', () => {
    it('updates state when hash changes externally', () => {
      const { result } = renderHook(() => useUrlHash<string>('tab', 'overview'));

      act(() => {
        window.history.replaceState(null, '', '#tab=external');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      expect(result.current[0]).toBe('external');
    });

    it('handles browser back/forward navigation', () => {
      const { result } = renderHook(() => useUrlHash<TestTab>('tab', 'overview'));

      // Set initial value
      act(() => {
        result.current[1]('details');
      });

      // Simulate back navigation
      act(() => {
        window.history.replaceState(null, '', '#tab=overview');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      expect(result.current[0]).toBe('overview');
    });
  });

  describe('Cleanup', () => {
    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useUrlHash('tab', 'overview'));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});

// ============================================================================
// useUrlHashState Tests (Multiple Values)
// ============================================================================

describe('useUrlHashState', () => {
  describe('Initialization', () => {
    it('returns defaults when no hash exists', () => {
      const defaults = { tab: 'overview', section: 'main' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      expect(result.current[0]).toEqual(defaults);
    });

    it('merges hash values with defaults', () => {
      window.history.replaceState(null, '', '#tab=details');

      const defaults = { tab: 'overview', section: 'main' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      expect(result.current[0]).toEqual({ tab: 'details', section: 'main' });
    });

    it('ignores unknown hash params', () => {
      window.history.replaceState(null, '', '#tab=details&unknown=value');

      const defaults = { tab: 'overview' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      expect(result.current[0]).toEqual({ tab: 'details' });
    });
  });

  describe('setHashValue', () => {
    it('updates specific key', () => {
      const defaults = { tab: 'overview', section: 'main' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      act(() => {
        result.current[1]('tab', 'details');
      });

      expect(result.current[0]).toEqual({ tab: 'details', section: 'main' });
    });

    it('updates URL hash', () => {
      const defaults = { tab: 'overview' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      act(() => {
        result.current[1]('tab', 'details');
      });

      expect(window.location.hash).toBe('#tab=details');
    });

    it('removes key when set to default', () => {
      window.history.replaceState(null, '', '#tab=details');

      const defaults = { tab: 'overview' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      act(() => {
        result.current[1]('tab', 'overview');
      });

      expect(window.location.hash).toBe('');
    });

    it('handles multiple keys', () => {
      const defaults = { tab: 'overview', section: 'main' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      act(() => {
        result.current[1]('tab', 'details');
      });

      act(() => {
        result.current[1]('section', 'sidebar');
      });

      expect(result.current[0]).toEqual({ tab: 'details', section: 'sidebar' });
      expect(window.location.hash).toContain('tab=details');
      expect(window.location.hash).toContain('section=sidebar');
    });
  });

  describe('clearHash', () => {
    it('resets all values to defaults', () => {
      window.history.replaceState(null, '', '#tab=details&section=sidebar');

      const defaults = { tab: 'overview', section: 'main' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      expect(result.current[0]).toEqual({ tab: 'details', section: 'sidebar' });

      act(() => {
        result.current[2](); // clearHash
      });

      expect(result.current[0]).toEqual(defaults);
      expect(window.location.hash).toBe('');
    });
  });

  describe('Hash Change Events', () => {
    it('updates state when hash changes externally', () => {
      const defaults = { tab: 'overview' };
      const { result } = renderHook(() => useUrlHashState(defaults));

      act(() => {
        window.history.replaceState(null, '', '#tab=external');
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });

      expect(result.current[0].tab).toBe('external');
    });
  });

  describe('Cleanup', () => {
    it('removes event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useUrlHashState({ tab: 'overview' }));

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
      removeEventListenerSpy.mockRestore();
    });
  });
});
