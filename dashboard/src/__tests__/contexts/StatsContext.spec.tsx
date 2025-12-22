import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StatsProvider, useStats } from '../../contexts/StatsContext';
import * as api from '../../api';

// Mock the API module
vi.mock('../../api', () => ({
  getStats: vi.fn(),
}));

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

/**
 * StatsContext Tests
 *
 * Tests for the stats context provider and hook.
 */

// Test component to consume the context
function TestConsumer() {
  const { stats, error, refreshStats } = useStats();

  return (
    <div>
      {stats && <div data-testid="stats">{JSON.stringify(stats)}</div>}
      {error && <div data-testid="error">{error.message}</div>}
      <button onClick={refreshStats} data-testid="refresh">
        Refresh
      </button>
    </div>
  );
}

describe('StatsProvider', () => {
  const mockStats = {
    totalEntries: 100,
    entryCounts: {
      request: 50,
      query: 30,
      exception: 10,
      log: 10,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (api.getStats as any).mockResolvedValue({ data: mockStats });
  });

  describe('Initial Load', () => {
    it('fetches stats on mount', async () => {
      // Arrange & Act
      render(
        <StatsProvider>
          <TestConsumer />
        </StatsProvider>
      );

      // Assert
      await waitFor(() => {
        expect(api.getStats).toHaveBeenCalled();
      });
    });

    it('provides stats to consumers', async () => {
      // Arrange & Act
      render(
        <StatsProvider>
          <TestConsumer />
        </StatsProvider>
      );

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('stats')).toHaveTextContent('100');
      });
    });

    it('handles fetch error on first load', async () => {
      // Arrange
      const error = new Error('Network error');
      (api.getStats as any).mockRejectedValue(error);

      // Act
      render(
        <StatsProvider>
          <TestConsumer />
        </StatsProvider>
      );

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      });
    });

    it('converts non-Error objects to Error', async () => {
      // Arrange
      (api.getStats as any).mockRejectedValue('String error');

      // Act
      render(
        <StatsProvider>
          <TestConsumer />
        </StatsProvider>
      );

      // Assert
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch stats');
      });
    });
  });

  describe('Provider Structure', () => {
    it('renders children', async () => {
      // Arrange & Act
      render(
        <StatsProvider>
          <div data-testid="child">Child content</div>
        </StatsProvider>
      );

      // Assert
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('provides refreshStats function', async () => {
      // Arrange & Act
      render(
        <StatsProvider>
          <TestConsumer />
        </StatsProvider>
      );

      // Assert
      expect(screen.getByTestId('refresh')).toBeInTheDocument();
    });
  });
});

describe('useStats', () => {
  it('throws error when used outside provider', () => {
    // Arrange
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act & Assert
    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useStats must be used within a StatsProvider');

    consoleError.mockRestore();
  });
});
