/**
 * The arrow in the detail header goes to the list the entry belongs to.
 *
 * It was `<Link to={-1 as unknown as string}>` — a cast around the fact that
 * `Link` takes a path and history deltas belong to `useNavigate`. The click
 * did go back, so nothing looked wrong; the href it rendered was the detail
 * page itself. Opening it in a new tab, copying the address or reading it
 * aloud all gave the reader the page they were already on.
 *
 * And a detail page is a link people send. Reached that way there is nothing
 * behind it — `goBack` lands on `about:blank`, which the e2e suite says in a
 * comment of its own. The entry's type always has a list.
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

const PAYLOADS: Record<string, Record<string, unknown>> = {
  request: { method: 'GET', url: '/orders', path: '/orders', statusCode: 200, duration: 1, headers: {}, query: {}, params: {} },
  query: { query: 'SELECT 1', source: 'typeorm', duration: 1, slow: false, connection: 'default' },
  graphql: { operationType: 'query', operationName: 'GetOrders', query: '{ orders { id } }', duration: 1 },
  log: { level: 'log', message: 'hello' },
  'http-client': { method: 'GET', url: 'https://x.test', hostname: 'x.test', path: '/', duration: 1, statusCode: 200 },
  dump: { operation: 'export', status: 'completed', duration: 1 },
};

const open = async (type: string) => {
  vi.mocked(api.getEntry).mockResolvedValue({
    data: { id: 7, type, createdAt: '2026-08-22T00:00:00.000Z', payload: PAYLOADS[type] },
  } as never);

  render(
    <MemoryRouter initialEntries={['/entries/7']}>
      <Routes>
        <Route path="/entries/:id" element={<EntryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );

  await waitFor(() => expect(api.getEntry).toHaveBeenCalled());
  return waitFor(() => screen.getByLabelText(/^Back to /));
};

describe('the back arrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['request', '/requests'],
    ['query', '/queries'],
    ['graphql', '/graphql'],
    ['log', '/logs'],
    ['http-client', '/http-client'],
    ['dump', '/dumps'],
  ])('sends a %s to %s', async (type, route) => {
    const arrow = await open(type);

    expect(arrow).toHaveAttribute('href', route);
  });

  it('never points at the page it is on', async () => {
    const arrow = await open('request');

    expect(arrow.getAttribute('href')).not.toContain('/entries/7');
  });

  it('says where it goes', async () => {
    // The arrow is an icon; without this a screen reader announces "link".
    const arrow = await open('query');

    expect(arrow).toHaveAttribute('aria-label', 'Back to queries');
  });
});
