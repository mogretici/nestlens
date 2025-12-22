/**
 * PaginationControls Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PaginationControls, {
  NewEntriesButton,
  LoadMoreButton,
  RefreshButton,
} from '../../components/PaginationControls';

// ============================================================================
// NewEntriesButton Tests
// ============================================================================

describe('NewEntriesButton', () => {
  it('renders null when count is 0', () => {
    const { container } = render(
      <NewEntriesButton count={0} onClick={() => {}} loading={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders button with singular text for 1 entry', () => {
    render(<NewEntriesButton count={1} onClick={() => {}} loading={false} />);
    expect(screen.getByText(/load 1 new entry/i)).toBeInTheDocument();
  });

  it('renders button with plural text for multiple entries', () => {
    render(<NewEntriesButton count={5} onClick={() => {}} loading={false} />);
    expect(screen.getByText(/load 5 new entries/i)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<NewEntriesButton count={3} onClick={handleClick} loading={false} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when loading', () => {
    render(<NewEntriesButton count={3} onClick={() => {}} loading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner when loading', () => {
    const { container } = render(
      <NewEntriesButton count={3} onClick={() => {}} loading={true} />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

// ============================================================================
// LoadMoreButton Tests
// ============================================================================

describe('LoadMoreButton', () => {
  it('renders null when hasMore is false', () => {
    const { container } = render(
      <LoadMoreButton hasMore={false} onClick={() => {}} loading={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders button when hasMore is true', () => {
    render(<LoadMoreButton hasMore={true} onClick={() => {}} loading={false} />);
    expect(screen.getByText(/load older entries/i)).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<LoadMoreButton hasMore={true} onClick={handleClick} loading={false} />);

    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when loading', () => {
    render(<LoadMoreButton hasMore={true} onClick={() => {}} loading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner when loading', () => {
    const { container } = render(
      <LoadMoreButton hasMore={true} onClick={() => {}} loading={true} />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });
});

// ============================================================================
// RefreshButton Tests
// ============================================================================

describe('RefreshButton', () => {
  it('shows enabled state when auto-refresh active', () => {
    render(
      <RefreshButton
        autoRefreshEnabled={true}
        onToggleAutoRefresh={() => {}}
        refreshing={false}
      />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-primary-600');
    expect(screen.getByText('Auto Refresh')).toBeInTheDocument();
  });

  it('shows disabled state when auto-refresh inactive', () => {
    render(
      <RefreshButton
        autoRefreshEnabled={false}
        onToggleAutoRefresh={() => {}}
        refreshing={false}
      />
    );

    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-gray-200');
    expect(screen.getByText('Refresh')).toBeInTheDocument();
  });

  it('calls onToggleAutoRefresh when clicked', () => {
    const handleToggle = vi.fn();
    render(
      <RefreshButton
        autoRefreshEnabled={false}
        onToggleAutoRefresh={handleToggle}
        refreshing={false}
      />
    );

    fireEvent.click(screen.getByRole('button'));
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });

  it('shows spinner when refreshing and not auto-refresh', () => {
    const { container } = render(
      <RefreshButton
        autoRefreshEnabled={false}
        onToggleAutoRefresh={() => {}}
        refreshing={true}
      />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('does not show spinner when auto-refresh is enabled', () => {
    const { container } = render(
      <RefreshButton
        autoRefreshEnabled={true}
        onToggleAutoRefresh={() => {}}
        refreshing={true}
      />
    );
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });
});

// ============================================================================
// PaginationControls Tests
// ============================================================================

describe('PaginationControls', () => {
  it('renders both buttons when applicable', () => {
    render(
      <PaginationControls
        newEntriesCount={5}
        hasMore={true}
        loading={false}
        onLoadNew={() => {}}
        onLoadMore={() => {}}
      />
    );

    expect(screen.getByText(/load 5 new entries/i)).toBeInTheDocument();
    expect(screen.getByText(/load older entries/i)).toBeInTheDocument();
  });

  it('hides new entries button when count is 0', () => {
    render(
      <PaginationControls
        newEntriesCount={0}
        hasMore={true}
        loading={false}
        onLoadNew={() => {}}
        onLoadMore={() => {}}
      />
    );

    expect(screen.queryByText(/new entr/i)).not.toBeInTheDocument();
    expect(screen.getByText(/load older entries/i)).toBeInTheDocument();
  });

  it('hides load more button when hasMore is false', () => {
    render(
      <PaginationControls
        newEntriesCount={3}
        hasMore={false}
        loading={false}
        onLoadNew={() => {}}
        onLoadMore={() => {}}
      />
    );

    expect(screen.getByText(/load 3 new entries/i)).toBeInTheDocument();
    expect(screen.queryByText(/load older entries/i)).not.toBeInTheDocument();
  });

  it('calls correct handlers', () => {
    const handleNew = vi.fn();
    const handleMore = vi.fn();

    render(
      <PaginationControls
        newEntriesCount={2}
        hasMore={true}
        loading={false}
        onLoadNew={handleNew}
        onLoadMore={handleMore}
      />
    );

    fireEvent.click(screen.getByText(/load 2 new entries/i));
    expect(handleNew).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText(/load older entries/i));
    expect(handleMore).toHaveBeenCalledTimes(1);
  });
});
