/**
 * The tags whose entries pruning leaves alone.
 *
 * Monitoring is stored in all three drivers and answered by the API, and
 * nothing showed it: a reader had no way to say which entries were worth
 * keeping, and no way to see what they had already said. It sits beside the
 * retention figures because that is what it changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MonitoredTags from '../../components/MonitoredTags';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getMonitoredTags: vi.fn(),
  addMonitoredTag: vi.fn(),
  removeMonitoredTag: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const listing = (tags: { tag: string; count: number }[]) => ({
  data: tags.map(({ tag, count }, index) => ({
    id: index + 1,
    tag,
    createdAt: '2026-01-01T00:00:00.000Z',
    count,
  })),
});

describe('the monitored tags panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists what is being kept, and how much', async () => {
    vi.mocked(api.getMonitoredTags).mockResolvedValue(
      listing([{ tag: 'CHECKOUT', count: 12 }]) as never,
    );

    render(<MonitoredTags />);

    await waitFor(() => expect(screen.getByText('CHECKOUT')).toBeInTheDocument());
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('says plainly when nothing is monitored', async () => {
    vi.mocked(api.getMonitoredTags).mockResolvedValue(listing([]) as never);

    render(<MonitoredTags />);

    await waitFor(() =>
      expect(screen.getByText(/everything is pruned by age/i)).toBeInTheDocument(),
    );
  });

  it('does not report an empty list it could not fetch', async () => {
    vi.mocked(api.getMonitoredTags).mockRejectedValue(new Error('API error: 403'));

    render(<MonitoredTags />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText(/everything is pruned by age/i)).not.toBeInTheDocument();
  });

  it('monitors a tag the reader types', async () => {
    vi.mocked(api.getMonitoredTags).mockResolvedValue(listing([]) as never);
    vi.mocked(api.addMonitoredTag).mockResolvedValue({ success: true, data: { tag: 'CHECKOUT' } } as never);

    render(<MonitoredTags />);
    await waitFor(() => expect(api.getMonitoredTags).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /monitor a tag/i }));
    await userEvent.type(screen.getByLabelText('Tag to monitor'), 'checkout');
    await userEvent.click(screen.getByLabelText('Save monitored tag'));

    await waitFor(() => expect(api.addMonitoredTag).toHaveBeenCalledWith('checkout'));
  });

  it('stops monitoring one the reader takes off', async () => {
    vi.mocked(api.getMonitoredTags).mockResolvedValue(
      listing([{ tag: 'CHECKOUT', count: 3 }]) as never,
    );
    vi.mocked(api.removeMonitoredTag).mockResolvedValue({ success: true } as never);

    render(<MonitoredTags />);
    await waitFor(() => expect(screen.getByText('CHECKOUT')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('Stop monitoring CHECKOUT'));

    await waitFor(() => expect(api.removeMonitoredTag).toHaveBeenCalledWith('CHECKOUT'));
  });

  it('says so when monitoring was refused', async () => {
    const toast = (await import('react-hot-toast')).default;
    vi.mocked(api.getMonitoredTags).mockResolvedValue(listing([]) as never);
    vi.mocked(api.addMonitoredTag).mockRejectedValue(new Error('API error: 403'));

    render(<MonitoredTags />);
    await waitFor(() => expect(api.getMonitoredTags).toHaveBeenCalled());

    await userEvent.click(screen.getByRole('button', { name: /monitor a tag/i }));
    await userEvent.type(screen.getByLabelText('Tag to monitor'), 'checkout');
    await userEvent.click(screen.getByLabelText('Save monitored tag'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('403')));
  });
});
