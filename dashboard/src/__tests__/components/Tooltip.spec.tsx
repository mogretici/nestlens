/**
 * Tooltip Component Tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Tooltip from '../../components/Tooltip';

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    it('renders children', () => {
      render(
        <Tooltip content="Tooltip text">
          <button>Hover me</button>
        </Tooltip>
      );

      expect(screen.getByText('Hover me')).toBeInTheDocument();
    });

    it('does not show tooltip initially', () => {
      render(
        <Tooltip content="Tooltip text">
          <button>Hover me</button>
        </Tooltip>
      );

      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
    });
  });

  describe('Visibility', () => {
    it('shows tooltip on mouse enter after delay', async () => {
      render(
        <Tooltip content="Tooltip text" delay={200}>
          <button>Hover me</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Hover me').parentElement!;
      fireEvent.mouseEnter(trigger);

      // Before delay
      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();

      // After delay
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(screen.getByText('Tooltip text')).toBeInTheDocument();
    });

    it('hides tooltip on mouse leave', async () => {
      render(
        <Tooltip content="Tooltip text" delay={0}>
          <button>Hover me</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Hover me').parentElement!;

      // Show tooltip
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });
      expect(screen.getByText('Tooltip text')).toBeInTheDocument();

      // Hide tooltip
      fireEvent.mouseLeave(trigger);
      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
    });

    it('cancels tooltip if mouse leaves before delay', () => {
      render(
        <Tooltip content="Tooltip text" delay={500}>
          <button>Hover me</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Hover me').parentElement!;

      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(200); // Before delay completes
      });

      fireEvent.mouseLeave(trigger);

      act(() => {
        vi.advanceTimersByTime(300); // Complete the delay
      });

      expect(screen.queryByText('Tooltip text')).not.toBeInTheDocument();
    });
  });

  describe('Content', () => {
    it('renders string content', () => {
      render(
        <Tooltip content="Simple text" delay={0}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByText('Simple text')).toBeInTheDocument();
    });

    it('renders ReactNode content', () => {
      render(
        <Tooltip content={<span data-testid="custom">Custom content</span>} delay={0}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByTestId('custom')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('renders tooltip in portal (document.body)', () => {
      render(
        <Tooltip content="Tooltip text" delay={0}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      // Tooltip should be a direct child of body (via portal)
      const tooltip = screen.getByText('Tooltip text');
      expect(tooltip.parentElement).toBe(document.body);
    });
  });

  describe('Position Variants', () => {
    it('renders with top position (default)', () => {
      render(
        <Tooltip content="Top tooltip" delay={0} position="top">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByText('Top tooltip')).toBeInTheDocument();
    });

    it('renders with bottom position', () => {
      render(
        <Tooltip content="Bottom tooltip" delay={0} position="bottom">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByText('Bottom tooltip')).toBeInTheDocument();
    });

    it('renders with left position', () => {
      render(
        <Tooltip content="Left tooltip" delay={0} position="left">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByText('Left tooltip')).toBeInTheDocument();
    });

    it('renders with right position', () => {
      render(
        <Tooltip content="Right tooltip" delay={0} position="right">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      expect(screen.getByText('Right tooltip')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('cleans up timeout on unmount', () => {
      const { unmount } = render(
        <Tooltip content="Tooltip" delay={500}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);

      // Unmount before delay completes
      unmount();

      // Advance timers - should not cause errors
      act(() => {
        vi.advanceTimersByTime(500);
      });

      // No errors should occur
      expect(screen.queryByText('Tooltip')).not.toBeInTheDocument();
    });

    it('handles rapid mouse enter/leave', () => {
      render(
        <Tooltip content="Tooltip" delay={200}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;

      // Rapid enter/leave sequence
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.mouseLeave(trigger);
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(50);
      });
      fireEvent.mouseLeave(trigger);

      // Advance past delay
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Tooltip should not be visible
      expect(screen.queryByText('Tooltip')).not.toBeInTheDocument();
    });

    it('uses default delay of 200ms', () => {
      render(
        <Tooltip content="Tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);

      // Before default delay
      act(() => {
        vi.advanceTimersByTime(199);
      });
      expect(screen.queryByText('Tooltip')).not.toBeInTheDocument();

      // After default delay
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText('Tooltip')).toBeInTheDocument();
    });

    it('tooltip has fixed positioning', () => {
      render(
        <Tooltip content="Fixed tooltip" delay={0}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      const tooltip = screen.getByText('Fixed tooltip');
      expect(tooltip).toHaveClass('fixed');
    });

    it('tooltip is not clickable (pointer-events-none)', () => {
      render(
        <Tooltip content="Non-clickable" delay={0}>
          <button>Trigger</button>
        </Tooltip>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.mouseEnter(trigger);
      act(() => {
        vi.advanceTimersByTime(0);
      });

      const tooltip = screen.getByText('Non-clickable');
      expect(tooltip).toHaveClass('pointer-events-none');
    });

    it('wraps children in inline-flex div', () => {
      render(
        <Tooltip content="Tooltip">
          <button>Trigger</button>
        </Tooltip>
      );

      const wrapper = screen.getByText('Trigger').parentElement!;
      expect(wrapper).toHaveClass('inline-flex');
    });
  });
});
