/**
 * The one way to tag an entry from the dashboard.
 *
 * `EntryTags` — an editor with a test file of its own — was rendered nowhere.
 * The endpoints, the service and all three storage drivers implement tagging,
 * and a reader had no way to reach any of it. The read-only side was uneven as
 * well: five of the nineteen detail views listed an entry's tags and the other
 * fourteen showed them nowhere at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EntryDetailPage from '../../pages/EntryDetailPage';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getEntry: vi.fn(),
  addTagsToEntry: vi.fn(),
  removeTagsFromEntry: vi.fn(),
  resolveEntry: vi.fn(),
  unresolveEntry: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}));

const entry = (type: string, tags: string[]) => ({
  data: {
    id: 7,
    type,
    createdAt: '2026-01-01T00:00:00.000Z',
    tags,
    payload:
      type === 'request'
        ? { method: 'GET', url: '/orders', path: '/orders', statusCode: 200, duration: 1 }
        : { level: 'info', message: 'hello' },
  },
  related: [],
});

const draw = (type = 'request') =>
  render(
    <MemoryRouter initialEntries={[`/${type}s/7`]}>
      <Routes>
        <Route path=":type/:id" element={<EntryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('tagging an entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the tags it has', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entry('request', ['CHECKOUT']) as never);

    draw();

    await waitFor(() => expect(screen.getByTestId('entry-tags')).toBeInTheDocument());
    expect(screen.getByText('CHECKOUT')).toBeInTheDocument();
  });

  it('shows the tags of a type whose view never listed them', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entry('log', ['SLOW']) as never);

    draw('log');

    await waitFor(() => expect(screen.getByTestId('entry-tags')).toBeInTheDocument());
    expect(screen.getByText('SLOW')).toBeInTheDocument();
  });

  it('writes a tag the reader types', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entry('request', []) as never);
    vi.mocked(api.addTagsToEntry).mockResolvedValue({ success: true, data: ['URGENT'] } as never);

    draw();
    await waitFor(() => expect(screen.getByTestId('entry-tags')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /add a tag/i }));
    await userEvent.type(screen.getByLabelText('New tag'), 'URGENT');
    await userEvent.click(screen.getByLabelText('Save tag'));

    await waitFor(() => expect(api.addTagsToEntry).toHaveBeenCalledWith(7, ['URGENT']));
  });

  it('shows the tag once it is written', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entry('request', []) as never);
    vi.mocked(api.addTagsToEntry).mockResolvedValue({ success: true, data: ['URGENT'] } as never);

    draw();
    await waitFor(() => expect(screen.getByTestId('entry-tags')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /add a tag/i }));
    await userEvent.type(screen.getByLabelText('New tag'), 'URGENT');
    await userEvent.click(screen.getByLabelText('Save tag'));

    await waitFor(() => expect(screen.getByText('URGENT')).toBeInTheDocument());
  });

  it('removes a tag the reader takes off', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entry('request', ['CHECKOUT']) as never);
    vi.mocked(api.removeTagsFromEntry).mockResolvedValue({ success: true, data: [] } as never);

    draw();
    await waitFor(() => expect(screen.getByTestId('entry-tags')).toBeInTheDocument());

    await userEvent.click(screen.getByLabelText('Remove tag CHECKOUT'));

    await waitFor(() => expect(api.removeTagsFromEntry).toHaveBeenCalledWith(7, ['CHECKOUT']));
  });
});
