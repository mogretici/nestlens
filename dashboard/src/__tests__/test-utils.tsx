/**
 * Test Utilities - Shared testing utilities and helpers
 */
import React, { ReactNode } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';

// ============================================================================
// WRAPPER COMPONENTS
// ============================================================================

interface RouterWrapperProps {
  children: ReactNode;
  initialEntries?: string[];
}

/**
 * Router wrapper for testing components that use react-router
 */
export function RouterWrapper({ children, initialEntries = ['/'] }: RouterWrapperProps) {
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="*" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

// ============================================================================
// CUSTOM RENDER FUNCTIONS
// ============================================================================

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
}

/**
 * Custom render with router context
 */
export function renderWithRouter(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
) {
  const { initialEntries = ['/'], ...renderOptions } = options;

  return render(ui, {
    wrapper: ({ children }) => (
      <RouterWrapper initialEntries={initialEntries}>{children}</RouterWrapper>
    ),
    ...renderOptions,
  });
}

// ============================================================================
// MOCK FACTORIES
// ============================================================================

/**
 * Create a mock entry for testing
 */
export function createMockEntry(overrides: Partial<{
  id: number;
  type: string;
  requestId: string;
  payload: Record<string, unknown>;
  tags: string[];
  createdAt: string;
}> = {}) {
  return {
    id: 1,
    type: 'request',
    requestId: 'test-request-id',
    payload: { method: 'GET', path: '/api/test', statusCode: 200 },
    tags: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create mock API response
 */
export function createMockApiResponse<T>(data: T, meta?: Record<string, unknown>) {
  return {
    data,
    meta: meta || { total: Array.isArray(data) ? data.length : 1 },
  };
}

/**
 * Create mock paginated response
 */
export function createMockPaginatedResponse<T>(
  data: T[],
  options: Partial<{
    total: number;
    hasMore: boolean;
    newestSequence: number;
    oldestSequence: number;
  }> = {}
) {
  return {
    data,
    meta: {
      total: options.total ?? data.length,
      hasMore: options.hasMore ?? false,
      newestSequence: options.newestSequence ?? data.length,
      oldestSequence: options.oldestSequence ?? 1,
    },
  };
}

// ============================================================================
// API MOCKS
// ============================================================================

/**
 * Create mock API module
 */
export function createMockApi() {
  return {
    getEntriesWithCursor: vi.fn(),
    checkNewEntries: vi.fn(),
    getLatestSequence: vi.fn(),
    getEntry: vi.fn(),
    getStats: vi.fn(),
    resolveEntry: vi.fn(),
    unresolveEntry: vi.fn(),
    clearEntries: vi.fn(),
  };
}

// ============================================================================
// WAIT UTILITIES
// ============================================================================

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('waitFor timeout');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Wait for next tick
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// ============================================================================
// KEYBOARD EVENT HELPERS
// ============================================================================

/**
 * Create keyboard event
 */
export function createKeyboardEvent(
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

/**
 * Simulate keyboard shortcut
 */
export function simulateKeyboardShortcut(
  key: string,
  modifiers: { ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean } = {}
) {
  const event = createKeyboardEvent(key, {
    ctrlKey: modifiers.ctrl,
    metaKey: modifiers.meta,
    shiftKey: modifiers.shift,
    altKey: modifiers.alt,
  });
  document.dispatchEvent(event);
  return event;
}

// ============================================================================
// URL HELPERS
// ============================================================================

/**
 * Get current URL search params from MemoryRouter
 */
export function getSearchParams(location: { search: string }): URLSearchParams {
  return new URLSearchParams(location.search);
}

// Re-export testing library utilities
export * from '@testing-library/react';
export { vi } from 'vitest';
