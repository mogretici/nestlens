/**
 * CopyButton Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CopyButton from '../../components/CopyButton';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.assign(navigator, { clipboard: mockClipboard });

describe('CopyButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Default Mode', () => {
    it('renders with default label', () => {
      render(<CopyButton text="test" />);
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('renders with custom label', () => {
      render(<CopyButton text="test" label="Copy URL" />);
      expect(screen.getByText('Copy URL')).toBeInTheDocument();
    });

    it('copies text on click', async () => {
      render(<CopyButton text="hello world" />);

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith('hello world');
      });
    });

    it('shows Copied! after successful copy', async () => {
      render(<CopyButton text="test" />);

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(screen.getByText('Copied!')).toBeInTheDocument();
      });
    });

    it('applies custom className', () => {
      render(<CopyButton text="test" className="custom-class" />);
      expect(screen.getByRole('button')).toHaveClass('custom-class');
    });
  });

  describe('Icon Only Mode', () => {
    it('renders as icon only button', () => {
      render(<CopyButton text="test" iconOnly />);
      expect(screen.queryByText('Copy')).not.toBeInTheDocument();
    });

    it('has title attribute', () => {
      render(<CopyButton text="test" iconOnly label="Copy ID" />);
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Copy ID');
    });

    it('copies text on click', async () => {
      render(<CopyButton text="icon-text" iconOnly />);

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalledWith('icon-text');
      });
    });
  });

  describe('Error Handling', () => {
    it('handles clipboard error', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Failed'));
      const toast = await import('react-hot-toast');

      render(<CopyButton text="test" />);

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(toast.default.error).toHaveBeenCalledWith('Failed to copy');
      });
    });
  });

  describe('Success Message', () => {
    it('uses custom success message', async () => {
      const toast = await import('react-hot-toast');

      render(<CopyButton text="test" successMessage="URL copied!" />);

      fireEvent.click(screen.getByRole('button'));

      await waitFor(() => {
        expect(toast.default.success).toHaveBeenCalledWith('URL copied!');
      });
    });
  });
});
