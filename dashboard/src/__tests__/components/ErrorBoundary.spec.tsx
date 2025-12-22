/**
 * ErrorBoundary Component Tests
 *
 * Tests for the error boundary that catches JavaScript errors
 * in the component tree.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Component that throws an error
function ThrowingComponent({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Child content</div>;
}

// ============================================================================
// ErrorBoundary Tests
// ============================================================================

describe('ErrorBoundary', () => {
  // Suppress React error boundary console errors during tests
  const originalError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe('Normal Rendering', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary>
          <div>Normal content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });

    it('renders multiple children', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
    });
  });

  describe('Error Catching', () => {
    it('catches errors from children', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('displays error message', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('shows helpful description', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(
        screen.getByText('An unexpected error occurred. Please try refreshing the page.')
      ).toBeInTheDocument();
    });

    it('logs error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Recovery Actions', () => {
    it('renders Try Again button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByRole('button', { name: 'Try Again' })).toBeInTheDocument();
    });

    it('renders Refresh Page button', () => {
      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByRole('button', { name: /refresh page/i })).toBeInTheDocument();
    });

    it('Try Again resets error state', () => {
      let shouldThrow = true;

      function ConditionalThrow() {
        if (shouldThrow) {
          throw new Error('Conditional error');
        }
        return <div>Recovered content</div>;
      }

      render(
        <ErrorBoundary>
          <ConditionalThrow />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Fix the error condition
      shouldThrow = false;

      // Click Try Again
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));

      // Should render recovered content
      expect(screen.getByText('Recovered content')).toBeInTheDocument();
    });

    it('Refresh Page reloads window', () => {
      const originalLocation = window.location;
      const mockReload = vi.fn();

      // @ts-expect-error - mocking window.location
      delete window.location;
      // @ts-expect-error - assigning partial Location mock
      window.location = { reload: mockReload } as Location;

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByRole('button', { name: /refresh page/i }));

      expect(mockReload).toHaveBeenCalled();

      // Restore
      // @ts-expect-error - restoring original Location
      window.location = originalLocation;
    });
  });

  describe('Custom Fallback', () => {
    it('renders custom fallback if provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom error UI</div>}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    });

    it('does not render default UI when fallback provided', () => {
      render(
        <ErrorBoundary fallback={<div>Custom error UI</div>}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('fallback can include complex components', () => {
      const CustomFallback = () => (
        <div>
          <h1>Oops!</h1>
          <button>Retry</button>
        </div>
      );

      render(
        <ErrorBoundary fallback={<CustomFallback />}>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Oops!')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
  });

  describe('Stack Trace (Development)', () => {
    it('shows stack trace toggle in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Stack trace should be available in development
      expect(screen.getByText('Show stack trace')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('expands stack trace on click', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const details = screen.getByText('Show stack trace');
      fireEvent.click(details);

      // Details should now be open
      expect(details.closest('details')).toHaveAttribute('open');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error Icon', () => {
    it('displays error icon', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // AlertTriangle icon should be present
      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('renders error in centered container', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      const wrapper = container.querySelector('.min-h-screen.flex.items-center.justify-center');
      expect(wrapper).toBeInTheDocument();
    });

    it('applies dark mode classes', () => {
      const { container } = render(
        <ErrorBoundary>
          <ThrowingComponent />
        </ErrorBoundary>
      );

      // Should have dark mode variants
      const card = container.querySelector('.bg-white.dark\\:bg-gray-800');
      expect(card).toBeInTheDocument();
    });
  });

  describe('Error Recovery', () => {
    it('can recover from error after fix', () => {
      let shouldThrow = true;

      function RecoverableComponent() {
        if (shouldThrow) {
          throw new Error('Initial error');
        }
        return <div>Content recovered</div>;
      }

      render(
        <ErrorBoundary>
          <RecoverableComponent />
        </ErrorBoundary>
      );

      // First render throws
      expect(screen.getByText('Initial error')).toBeInTheDocument();

      // Fix the issue
      shouldThrow = false;

      // Try Again - now works
      fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
      expect(screen.getByText('Content recovered')).toBeInTheDocument();
    });
  });
});
