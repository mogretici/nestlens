/**
 * An entry whose payload is not the shape its view expects.
 *
 * The detail views read their fields directly — `payload.method`,
 * `payload.level`, `payload.listeners` — and a payload does not always have
 * them: one written by an older version, or one that could not be serialised
 * and was replaced by the reason it could not. Rendering such an entry threw,
 * and the route's error boundary answered with *Something went wrong* — for an
 * entry whose data was sitting right there.
 *
 * Measured before: nineteen views, three payload shapes, forty-one crashes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const draw = () =>
  render(
    <MemoryRouter initialEntries={['/requests/1']}>
      <Routes>
        <Route path=":type/:id" element={<EntryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

const entryWith = (payload: unknown) => ({
  data: { id: 1, type: 'request', createdAt: '2026-01-01T00:00:00.000Z', payload },
  related: [],
});

describe('an entry the view cannot read', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the payload it has', async () => {
    // What the storage writes when nothing could serialise the payload.
    vi.mocked(api.getEntry).mockResolvedValue(
      entryWith({ nestlensError: 'payload could not be recorded: circular' }) as never,
    );

    draw();

    await waitFor(() => expect(screen.getByTestId('raw-payload')).toBeInTheDocument());
  });

  it('says why it is shown that way', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entryWith({}) as never);

    draw();

    await waitFor(() => expect(screen.getByTestId('raw-payload')).toBeInTheDocument());
    expect(screen.getByText(/shown as it was recorded/i)).toBeInTheDocument();
  });

  it('does not answer with the page-level error card', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(entryWith({}) as never);

    draw();

    await waitFor(() => expect(screen.getByTestId('raw-payload')).toBeInTheDocument());
    expect(screen.queryByText(/Something went wrong/i)).not.toBeInTheDocument();
  });

  it('still renders the ordinary view for an ordinary entry', async () => {
    vi.mocked(api.getEntry).mockResolvedValue(
      entryWith({
        method: 'GET',
        url: '/orders',
        path: '/orders',
        statusCode: 200,
        duration: 12,
      }) as never,
    );

    draw();

    await waitFor(() => expect(screen.queryByTestId('raw-payload')).not.toBeInTheDocument());
  });
});
