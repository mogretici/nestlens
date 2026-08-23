/**
 * "Entry not found" is a claim about the entry, not about the connection.
 *
 * Every failed fetch landed in the same branch, so a dashboard reached from an
 * address the guard does not allow was told the entry did not exist — measured
 * identically for 403, 404 and 500 with the entry present the whole time. A
 * reader would go looking for a pruning bug.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EntryDetailPage from '../../pages/EntryDetailPage';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntry: vi.fn(),
  updateEntry: vi.fn(),
  addTagsToEntry: vi.fn(),
  removeTagsFromEntry: vi.fn(),
  resolveEntry: vi.fn(),
  unresolveEntry: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  Toaster: () => null,
}));

const draw = () =>
  render(
    <MemoryRouter initialEntries={['/entries/7']}>
      <Routes>
        <Route path="/entries/:id" element={<EntryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('the detail page when the entry cannot be fetched', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['403', 'API error: 403'],
    ['500', 'API error: 500'],
    ['a network failure', 'Failed to fetch'],
  ])('does not claim the entry is missing on %s', async (_name, message) => {
    vi.mocked(api.getEntry).mockRejectedValue(new Error(message));

    draw();

    await waitFor(() => expect(screen.getByTestId('entry-error')).toBeInTheDocument());
    expect(screen.queryByText('Entry not found')).not.toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('still says not found when it really is not there', async () => {
    vi.mocked(api.getEntry).mockRejectedValue(new Error('API error: 404'));

    draw();

    await waitFor(() => expect(screen.getByTestId('entry-missing')).toBeInTheDocument());
    expect(screen.getByText('Entry not found')).toBeInTheDocument();
  });

  it('announces a failure but not an absence', async () => {
    vi.mocked(api.getEntry).mockRejectedValue(new Error('API error: 403'));

    draw();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('offers the way out either way', async () => {
    vi.mocked(api.getEntry).mockRejectedValue(new Error('API error: 500'));

    draw();

    await waitFor(() => expect(screen.getByTestId('entry-error')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Go back to dashboard' })).toBeInTheDocument();
  });
});
