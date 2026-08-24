/**
 * Deleting what one page lists.
 *
 * Pruning deletes by age and the sidebar's button deletes everything, so there
 * was no way to say "these, now" — although every storage has had
 * `pruneByType` since the beginning and nothing ever called it.
 *
 * Two presses, because it cannot be undone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import toast from 'react-hot-toast';
import ClearTypeButton from '../../components/ClearTypeButton';
import { clearEntries } from '../../api';

vi.mock('../../api', () => ({ clearEntries: vi.fn() }));
vi.mock('react-hot-toast', () => {
  const fn = vi.fn() as unknown as {
    (message: string): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  fn.success = vi.fn();
  fn.error = vi.fn();

  return { default: fn };
});

const open = (onCleared = vi.fn()) => {
  render(<ClearTypeButton type="query" label="queries" onCleared={onCleared} />);

  return { onCleared, button: () => screen.getByRole('button') };
};

describe('the clear button on a list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clearEntries).mockResolvedValue({
      success: true,
      message: 'Cleared 4 query entries',
      deleted: 4,
    });
  });

  it('does nothing on the first press', async () => {
    const { button } = open();

    fireEvent.click(button());

    expect(clearEntries).not.toHaveBeenCalled();
  });

  it('says what the second press will do', () => {
    const { button } = open();

    fireEvent.click(button());

    expect(button()).toHaveTextContent('Delete all queries?');
  });

  it('deletes only this type on the second press', async () => {
    const { button } = open();

    fireEvent.click(button());
    fireEvent.click(button());

    await waitFor(() => expect(clearEntries).toHaveBeenCalledWith('query'));
  });

  it('reports what the server said it deleted', async () => {
    const { button } = open();

    fireEvent.click(button());
    fireEvent.click(button());

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Cleared 4 query entries'));
  });

  it('tells the page to catch up', async () => {
    const onCleared = vi.fn();
    const { button } = open(onCleared);

    fireEvent.click(button());
    fireEvent.click(button());

    await waitFor(() => expect(onCleared).toHaveBeenCalled());
  });

  it('says so when the API refuses', async () => {
    vi.mocked(clearEntries).mockRejectedValue(new Error('API error: 403'));
    const onCleared = vi.fn();
    const { button } = open(onCleared);

    fireEvent.click(button());
    fireEvent.click(button());

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('disarms itself after a while', async () => {
    // A button left armed on a page nobody is looking at must not be pressable
    // by accident an hour later.
    vi.useFakeTimers();
    const { button } = open();

    fireEvent.click(button());
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(button()).toHaveTextContent('Clear');
    vi.useRealTimers();
  });
});
