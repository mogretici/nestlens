/**
 * The detail page shows the entry its URL names, and no other.
 *
 * Moving between entries starts a second request before the first has landed —
 * from the list, from a related entry, from the back button. Whichever finished
 * last used to win, so a slow response for the entry just left would overwrite
 * the one just opened: a GraphQL row clicked, a REST health check displayed.
 *
 * That was reported as the page being wrong about what it was showing, which is
 * exactly what it was. The list had a duplicate-key defect producing the same
 * symptom; fixing it did not fix this, because this is a second, independent
 * race in the page underneath.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
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

const entryFor = (id: number, url: string) => ({
  id,
  type: 'request',
  createdAt: '2026-08-21T00:00:00.000Z',
  payload: {
    method: 'GET',
    url,
    path: url,
    statusCode: 200,
    duration: 1,
    headers: {},
    query: {},
    params: {},
  },
});

const renderAt = (id: number) =>
  render(
    <MemoryRouter initialEntries={[`/entries/${id}`]}>
      <Routes>
        <Route path="/entries/:id" element={<EntryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe('entry detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the entry it was asked for', async () => {
    vi.mocked(api.getEntry).mockResolvedValue({
      success: true,
      data: entryFor(7, '/orders'),
    } as never);

    renderAt(7);

    await waitFor(() => expect(screen.getByText('/orders')).toBeInTheDocument());
  });

  it('does not show one entry under another entry’s id', async () => {
    // The real race: the reader opens 7, then opens 9 before 7 has answered,
    // and 7's response lands last. Whichever finished last used to win.
    const pending = new Map<number, (value: unknown) => void>();

    vi.mocked(api.getEntry).mockImplementation(
      (id: number) =>
        new Promise((resolve) => {
          pending.set(id, resolve);
        }) as never,
    );

    let go: ((path: string) => void) | undefined;
    function Navigator() {
      go = useNavigate();
      return null;
    }

    render(
      <MemoryRouter initialEntries={['/entries/7']}>
        <Navigator />
        <Routes>
          <Route path="/entries/:id" element={<EntryDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => expect(pending.has(7)).toBe(true));

    // Navigate to 9 while 7 is still in the air — the same component, a new id.
    act(() => go?.('/entries/9'));
    await waitFor(() => expect(pending.has(9)).toBe(true));

    // 9 answers, then 7 answers late.
    act(() => pending.get(9)?.({ success: true, data: entryFor(9, '/products') }));
    await waitFor(() => expect(screen.getByText('/products')).toBeInTheDocument());

    act(() => pending.get(7)?.({ success: true, data: entryFor(7, '/health') }));

    // The late answer for 7 must not replace what 9 is showing.
    await waitFor(() => expect(screen.getByText('/products')).toBeInTheDocument());
    expect(screen.queryByText('/health')).not.toBeInTheDocument();
  });

  it('keeps the spinner up until the entry for this id has arrived', async () => {
    let settle: ((value: unknown) => void) | undefined;

    vi.mocked(api.getEntry).mockImplementation(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }) as never,
    );

    renderAt(9);

    // Loading is derived from whether what is held matches the id in the URL,
    // so it cannot disagree with the data the way a separate flag could.
    expect(screen.getByRole('status')).toBeInTheDocument();

    settle?.({ success: true, data: entryFor(9, '/products') });

    await waitFor(() => expect(screen.getByText('/products')).toBeInTheDocument());
  });

  it('stops loading when the entry cannot be fetched', async () => {
    vi.mocked(api.getEntry).mockRejectedValue(new Error('gone'));

    renderAt(11);

    // The spinner has to stop even on failure, or the page shows one forever.
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });
});
