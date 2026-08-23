/**
 * Clearing every entry has to report what actually happened.
 *
 * The button assumed it worked: it awaited the request without looking at the
 * answer, said *All entries cleared* and reloaded the page. A refusal — a
 * guard that did not recognise the caller — or an API that could not be
 * reached left the reader with a success message over a list that still had
 * everything in it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import toast from 'react-hot-toast';
import Layout from '../../components/Layout';
import { StatsProvider } from '../../contexts/StatsContext';
import { clearEntries } from '../../api';

vi.mock('../../api', () => ({
  clearEntries: vi.fn(),
  getRecordingStatus: vi.fn().mockResolvedValue({ data: { isPaused: false, pausedAt: null } }),
  pauseRecording: vi.fn().mockResolvedValue({ data: { isPaused: true } }),
  resumeRecording: vi.fn().mockResolvedValue({ data: { isPaused: false } }),
  getStats: vi.fn().mockResolvedValue({ data: { total: 1, byType: {}, unresolvedExceptions: 0 } }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const reload = vi.fn();

const renderLayout = () =>
  render(
    <MemoryRouter>
      <StatsProvider>
        <Layout />
      </StatsProvider>
    </MemoryRouter>,
  );

const pressClear = (): void => {
  fireEvent.click(screen.getAllByRole('button', { name: /clear all data/i })[0]);
};

describe('clearing every entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
  });

  it('says so when it worked', async () => {
    vi.mocked(clearEntries).mockResolvedValue({ success: true, message: 'All entries cleared' });

    renderLayout();
    pressClear();

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('All entries cleared'));
  });

  it('reloads once it has', async () => {
    vi.mocked(clearEntries).mockResolvedValue({ success: true, message: 'ok' });

    renderLayout();
    pressClear();

    await waitFor(() => expect(reload).toHaveBeenCalled());
  });

  it('says so when it was refused', async () => {
    vi.mocked(clearEntries).mockRejectedValue(new Error('API error: 403'));

    renderLayout();
    pressClear();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('403')));
  });

  it('does not claim success when it was refused', async () => {
    vi.mocked(clearEntries).mockRejectedValue(new Error('API error: 403'));

    renderLayout();
    pressClear();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('leaves the page where it is when it was refused', async () => {
    vi.mocked(clearEntries).mockRejectedValue(new Error('API error: 500'));

    renderLayout();
    pressClear();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(reload).not.toHaveBeenCalled();
  });

  it('asks nothing of the API when the reader says no', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    renderLayout();
    pressClear();

    expect(clearEntries).not.toHaveBeenCalled();
  });
});
