/**
 * PaginationControls Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  NewEntriesButton,
  LoadMoreButton,
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
// PaginationControls Tests
// ============================================================================

