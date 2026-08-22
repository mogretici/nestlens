/**
 * When a request happened, and what happened inside it.
 *
 * The dashboard could show which entries belonged to a request and never when
 * they happened relative to one another — the first thing anybody wants from a
 * slow endpoint. Everything NestLens records carries the moment it happened and
 * how long it took, so a row belongs at `createdAt - duration` to `createdAt`;
 * that only became true once entries stopped being stamped when they were
 * written, which put a whole buffered second on one instant.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RequestTimeline from '../../components/RequestTimeline';
import { Entry } from '../../types';

const at = (offsetMs: number): string => new Date(1_700_000_000_000 + offsetMs).toISOString();

const entry = (
  id: number,
  type: string,
  finishedAt: number,
  duration: number,
  payload: Record<string, unknown> = {},
): Entry =>
  ({
    id,
    type,
    createdAt: at(finishedAt),
    requestId: 'req-1',
    payload: { duration, ...payload },
  }) as unknown as Entry;

/**
 * A request that took 500ms, with two queries and a log inside it.
 *
 * `query` is the parsed query string, which is what a request payload actually
 * carries — the fixture used to leave it out, and a label picked by field name
 * read it as the SQL a query entry holds. Every request row on a real page said
 * `[object Object]`.
 */
const request = entry(1, 'request', 500, 500, {
  method: 'GET',
  path: '/orders',
  url: '/orders?page=2',
  query: { page: '2' },
  params: {},
});
const firstQuery = entry(2, 'query', 150, 100, { query: 'SELECT * FROM orders' });
const secondQuery = entry(3, 'query', 400, 200, { query: 'SELECT * FROM items' });
const log = entry(4, 'log', 300, 0, { level: 'info', message: 'halfway' });

const draw = (related: Entry[] = [firstQuery, secondQuery, log]) =>
  render(
    <MemoryRouter>
      <RequestTimeline request={request} related={related} />
    </MemoryRouter>,
  );

/** The bars, as the percentages they were positioned at. */
const bars = (container: HTMLElement): { left: number; width: number }[] =>
  [...container.querySelectorAll('[data-testid="timeline-bar"]')].map((bar) => ({
    left: Number.parseFloat((bar as HTMLElement).style.left),
    width: Number.parseFloat((bar as HTMLElement).style.width),
  }));

describe('RequestTimeline', () => {
  describe('what a row is called', () => {
    it('names the request by its URL, not by its query string', () => {
      draw();

      expect(screen.getByText('/orders?page=2')).toBeInTheDocument();
      expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
    });

    it('names a query by its SQL', () => {
      draw();

      expect(screen.getByText('SELECT * FROM orders')).toBeInTheDocument();
    });

    it('names a log by its message', () => {
      draw();

      expect(screen.getByText('halfway')).toBeInTheDocument();
    });

    it('falls back to the type when nothing in the payload reads as a name', () => {
      draw([entry(5, 'cache', 200, 5, { hit: true, ttl: 30 })]);

      // Twice: the type badge, and the label falling back to it.
      expect(screen.getAllByText('cache')).toHaveLength(2);
    });

    it('ignores a field that holds an object rather than text', () => {
      draw([entry(6, 'model', 200, 5, { name: { first: 'ada' }, entity: 'User' })]);

      expect(screen.queryByText(/\[object Object\]/)).not.toBeInTheDocument();
      expect(screen.getAllByText('model')).toHaveLength(2);
    });
  });

  describe('every row is visible', () => {
    it('gives a bar to an entry that took no measurable time', () => {
      // The log finishes mid-request, so it sits in the middle.
      const { container } = draw();

      expect(bars(container).every((bar) => bar.width > 0)).toBe(true);
    });

    it('gives a bar to the last thing to happen', () => {
      // A request ends when everything inside it has ended, so its own row sits
      // at the right edge. Trimming the sliver against that edge left it at
      // zero width and the row read as empty.
      const instant = entry(9, 'log', 500, 0, { message: 'at the very end' });
      const { container } = draw([instant]);

      const drawn = bars(container);
      expect(drawn).toHaveLength(2);
      expect(drawn.every((bar) => bar.width > 0)).toBe(true);
      expect(drawn.every((bar) => bar.left + bar.width <= 100.001)).toBe(true);
    });
  });

  it('shows a row for the request and for everything inside it', () => {
    draw();

    expect(screen.getAllByTestId('timeline-bar')).toHaveLength(4);
  });

  it('says how many entries and over how long', () => {
    draw();

    expect(screen.getByText('4 entries over 500ms')).toBeInTheDocument();
  });

  it('starts the request at the beginning of the window', () => {
    const { container } = draw();

    // The request began first and lasted the whole window.
    expect(bars(container)[0]).toEqual({ left: 0, width: 100 });
  });

  it('places each entry where it happened', () => {
    const { container } = draw();
    const positioned = bars(container);

    // 500ms window. The first query ran from 50ms to 150ms, the second from
    // 200ms to 400ms, and the log is a moment at 300ms.
    expect(positioned[1].left).toBeCloseTo(10, 1);
    expect(positioned[1].width).toBeCloseTo(20, 1);
    expect(positioned[2].left).toBeCloseTo(40, 1);
    expect(positioned[2].width).toBeCloseTo(40, 1);
  });

  it('gives something that took no time a visible mark rather than nothing', () => {
    const { container } = draw();
    const logBar = bars(container)[3];

    expect(logBar.left).toBeCloseTo(60, 1);
    expect(logBar.width).toBeGreaterThan(0);
  });

  it('orders the rows by when they started', () => {
    const { container } = draw();
    const lefts = bars(container).map((bar) => bar.left);

    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
  });

  it('labels a row with what it did, not with its type', () => {
    draw();

    expect(screen.getByText('SELECT * FROM orders')).toBeInTheDocument();
    expect(screen.getByText('halfway')).toBeInTheDocument();
  });

  it('links each row to the entry it stands for', () => {
    draw();

    expect(screen.getByText('SELECT * FROM orders').closest('a')).toHaveAttribute(
      'href',
      '/entries/2',
    );
  });

  describe('what it must not clip', () => {
    it('widens the window for work that outlived the response', () => {
      // A write that carries on after the response is sent is exactly what
      // somebody opens a timeline to find; a chart clipped to the request
      // would hide it.
      const afterwards = entry(5, 'job', 900, 300, { name: 'send-receipt' });
      const { container } = draw([firstQuery, afterwards]);

      expect(screen.getByText(/entries over 900ms/)).toBeInTheDocument();
      expect(bars(container).every((bar) => bar.left + bar.width <= 100.01)).toBe(true);
    });

    it('keeps every bar inside the track', () => {
      const { container } = draw();

      expect(bars(container).every((bar) => bar.left >= 0 && bar.left + bar.width <= 100.01)).toBe(
        true,
      );
    });
  });

  describe('when there is nothing to draw', () => {
    it('shows nothing for a request that produced no other entries', () => {
      const { container } = render(
        <MemoryRouter>
          <RequestTimeline request={request} related={[]} />
        </MemoryRouter>,
      );

      expect(container.querySelector('[data-testid="request-timeline"]')).toBeNull();
    });

    it('survives a request that took no measurable time', () => {
      // Dividing by a zero-length window would put every bar at Infinity.
      const instant = entry(1, 'request', 0, 0, { method: 'GET', path: '/ping' });
      const alongside = entry(2, 'log', 0, 0, { level: 'info', message: 'ping' });

      const { container } = render(
        <MemoryRouter>
          <RequestTimeline request={instant} related={[alongside]} />
        </MemoryRouter>,
      );

      expect(bars(container).every((bar) => Number.isFinite(bar.left))).toBe(true);
    });

    it('ignores a duration that is not a number', () => {
      const broken = entry(2, 'query', 100, Number.NaN, { query: 'SELECT 1' });

      const { container } = draw([broken]);

      expect(bars(container).every((bar) => Number.isFinite(bar.width))).toBe(true);
    });
  });
});
