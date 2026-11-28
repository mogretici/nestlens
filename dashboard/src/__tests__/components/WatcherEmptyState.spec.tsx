/**
 * An empty table says why, when its watcher cannot record.
 *
 * "No Redis commands recorded yet" over a watcher that has no Redis client
 * reads as an application that sends no commands. A production application
 * read its Redis, HTTP client and Logs tabs that way for months. The table now
 * asks the watcher's status and, when it is `waiting`, `off` or `manual`, says
 * so with the reason and the fix; `recording` keeps the table's own message.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ReactNode } from 'react';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import DataTable, { Column } from '../../components/DataTable';
import Layout from '../../components/Layout';
import { StatsProvider } from '../../contexts/StatsContext';
import { WatcherStatusContext } from '../../contexts/useWatcherStatus';
import { WatcherStatusProvider } from '../../contexts/WatcherStatusContext';
import { EntryType, WatcherState, WatcherStatusReport } from '../../types';
import * as api from '../../api';

vi.mock('../../api', () => ({
  getWatcherStatus: vi.fn(),
  clearEntries: vi.fn().mockResolvedValue({}),
  getRecordingStatus: vi.fn().mockResolvedValue({ data: { isPaused: false } }),
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  getStats: vi.fn().mockResolvedValue({ data: { total: 0, byType: {} } }),
}));

vi.mock('react-hot-toast', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const report = (
  type: EntryType,
  state: WatcherState,
  reason = 'No Redis client is provided under NESTLENS_REDIS_CLIENT.',
): WatcherStatusReport => ({
  type,
  option: type === 'http-client' ? 'watchers.httpClient' : `watchers.${type}`,
  state,
  reason,
  docs: `https://nestlens-docs.vercel.app/docs/watchers/${type}#fix`,
});

const columns: Column<{ id: number }>[] = [
  { key: 'id', header: 'ID', render: (row) => <span>{row.id}</span> },
];

const withStatuses = (reports: WatcherStatusReport[], children: ReactNode) => (
  <WatcherStatusContext.Provider value={new Map(reports.map((r) => [r.type, r]))}>
    {children}
  </WatcherStatusContext.Provider>
);

const table = (data: { id: number }[] = [], error: Error | null = null) => (
  <DataTable
    columns={columns}
    data={data}
    keyExtractor={(row) => row.id}
    emptyMessage="No Redis commands recorded yet"
    watcher="redis"
    error={error}
  />
);

describe('an empty table whose watcher is waiting', () => {
  it('says the watcher has nothing to record, why, and links the fix', () => {
    // Arrange / Act
    render(withStatuses([report('redis', 'waiting')], table()));

    // Assert
    const notice = screen.getByTestId('watcher-empty-state');
    expect(notice).toHaveAttribute('data-state', 'waiting');
    expect(screen.getByText('This watcher is on, and has nothing to record')).toBeInTheDocument();
    expect(
      screen.getByText('No Redis client is provided under NESTLENS_REDIS_CLIENT.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how to fix this/i })).toHaveAttribute(
      'href',
      'https://nestlens-docs.vercel.app/docs/watchers/redis#fix',
    );
    expect(screen.getByText('watchers.redis')).toBeInTheDocument();
    expect(screen.queryByText('No Redis commands recorded yet')).not.toBeInTheDocument();
  });

  it('opens the fix in a new tab without handing it the dashboard', () => {
    render(withStatuses([report('redis', 'waiting')], table()));

    const link = screen.getByRole('link', { name: /how to fix this/i });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('can be reached from the keyboard', async () => {
    render(withStatuses([report('redis', 'waiting')], table()));

    await userEvent.tab();

    expect(screen.getByRole('link', { name: /how to fix this/i })).toHaveFocus();
  });
});

describe('an empty table whose watcher', () => {
  it('is off says it is switched off', () => {
    render(withStatuses([report('redis', 'off', 'Switched off in the configuration.')], table()));

    expect(screen.getByText('This watcher is switched off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /how to switch it on/i })).toBeInTheDocument();
  });

  it('is manual says it records what the code hands it', () => {
    render(withStatuses([report('redis', 'manual', 'Records trackCheck() calls.')], table()));

    expect(screen.getByText('This watcher records what your code hands it')).toBeInTheDocument();
  });

  it('is recording keeps the table’s own message', () => {
    render(withStatuses([report('redis', 'recording', 'Recording.')], table()));

    expect(screen.getByText('No Redis commands recorded yet')).toBeInTheDocument();
    expect(screen.queryByTestId('watcher-empty-state')).not.toBeInTheDocument();
  });

  it('has not been asked about keeps the table’s own message', () => {
    render(table());

    expect(screen.getByText('No Redis commands recorded yet')).toBeInTheDocument();
  });
});

describe('a table whose watcher is waiting', () => {
  it('still lists the entries it has', () => {
    render(withStatuses([report('redis', 'waiting')], table([{ id: 7 }])));

    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.queryByTestId('watcher-empty-state')).not.toBeInTheDocument();
  });

  it('says it could not load them, when that is what happened', () => {
    render(withStatuses([report('redis', 'waiting')], table([], new Error('API error: 403'))));

    expect(screen.getByTestId('table-error')).toBeInTheDocument();
    expect(screen.queryByTestId('watcher-empty-state')).not.toBeInTheDocument();
  });
});

describe('the watcher status provider', () => {
  beforeEach(() => {
    vi.mocked(api.getWatcherStatus).mockReset();
  });

  it('asks the API and hands every page the answer', async () => {
    vi.mocked(api.getWatcherStatus).mockResolvedValue({ data: [report('redis', 'waiting')] });

    render(<WatcherStatusProvider>{table()}</WatcherStatusProvider>);

    expect(await screen.findByTestId('watcher-empty-state')).toBeInTheDocument();
    expect(api.getWatcherStatus).toHaveBeenCalledTimes(1);
  });

  it('leaves the table’s own message when the API cannot answer', async () => {
    vi.mocked(api.getWatcherStatus).mockRejectedValue(new Error('API error: 403'));

    render(<WatcherStatusProvider>{table()}</WatcherStatusProvider>);

    await waitFor(() => expect(api.getWatcherStatus).toHaveBeenCalled());
    expect(screen.getByText('No Redis commands recorded yet')).toBeInTheDocument();
  });
});

describe('the sidebar', () => {
  const renderLayout = (reports: WatcherStatusReport[]) =>
    render(
      <MemoryRouter>
        <StatsProvider>{withStatuses(reports, <Layout />)}</StatsProvider>
      </MemoryRouter>,
    );

  it('marks a watcher that is waiting, in both navigations', () => {
    renderLayout([report('redis', 'waiting'), report('http-client', 'waiting')]);

    expect(screen.getAllByTestId('waiting-redis')).toHaveLength(2);
    expect(screen.getAllByTestId('waiting-http-client')).toHaveLength(2);
    expect(screen.getAllByText('(recording nothing)')).toHaveLength(4);
  });

  it('marks nothing that is recording, off or manual', () => {
    renderLayout([
      report('request', 'recording'),
      report('redis', 'off'),
      report('gate', 'manual'),
    ]);

    expect(screen.queryByText('(recording nothing)')).not.toBeInTheDocument();
  });
});

describe('every list page', () => {
  const PAGES = join(__dirname, '..', '..', 'pages');

  /** `[page, listed type, type handed to the table]` for each page that lists one type. */
  const pages = readdirSync(PAGES).flatMap((file) => {
    const source = readFileSync(join(PAGES, file), 'utf8');
    const listed = /usePaginatedEntries<\w+>\(\{\s*type: '([a-z-]+)'/.exec(source)?.[1];

    return listed ? [[file, listed, /watcher="([a-z-]+)"/.exec(source)?.[1]] as const] : [];
  });

  it('finds the pages it checks', () => {
    expect(pages).toHaveLength(19);
  });

  it.each(pages)('%s hands its table the type it lists', (_file, listed, handed) => {
    expect(handed).toBe(listed);
  });
});
