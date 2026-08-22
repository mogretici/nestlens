import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Entry } from '../types';
import { parseDate } from '../utils/date';

interface RequestTimelineProps {
  /** The request the timeline is drawn for. */
  request: Entry;
  /** Everything else recorded under the same request id. */
  related: Entry[];
}

/**
 * What each kind of entry looks like on the waterfall.
 *
 * The same colours the sidebar and the dashboard cards use, so a bar and its
 * badge agree. Tailwind needs whole class names to keep them, which is why
 * these are written out rather than built from the type.
 */
const BAR_COLOURS: Record<string, string> = {
  request: 'bg-blue-500',
  query: 'bg-purple-500',
  graphql: 'bg-fuchsia-500',
  exception: 'bg-red-500',
  log: 'bg-green-500',
  job: 'bg-yellow-500',
  schedule: 'bg-gray-500',
  batch: 'bg-lime-500',
  command: 'bg-slate-500',
  cache: 'bg-cyan-500',
  redis: 'bg-rose-500',
  model: 'bg-violet-500',
  'http-client': 'bg-indigo-500',
  mail: 'bg-orange-500',
  notification: 'bg-pink-500',
  view: 'bg-teal-500',
  gate: 'bg-amber-500',
  dump: 'bg-emerald-500',
  event: 'bg-sky-500',
};

/** One row of the waterfall. */
interface Span {
  entry: Entry;
  /** Milliseconds from the start of the window. */
  offset: number;
  duration: number;
  label: string;
}

const formatMs = (ms: number): string => {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

/**
 * What to call a row.
 *
 * The first thing a reader looks for is which query, which key, which URL —
 * not the type, which the colour already says.
 */
const LABEL_FIELDS = [
  'query',
  'operationName',
  'key',
  'url',
  'path',
  'name',
  'message',
  'command',
  'operation',
] as const;

const labelFor = (entry: Entry): string => {
  const payload = entry.payload as unknown as Record<string, unknown>;

  // Only a field that actually holds text. `query` is a SQL string on a query
  // entry and the parsed query string — an object — on a request, and taking
  // it either way labelled every request row `[object Object]`.
  const candidate =
    LABEL_FIELDS.map((field) => payload[field]).find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    ) ?? entry.type;

  const flat = candidate.replace(/\s+/g, ' ').trim();
  return flat.length > 70 ? `${flat.slice(0, 70)}…` : flat;
};

/**
 * When a request happened, and what happened inside it.
 *
 * Everything NestLens records carries the moment it happened and how long it
 * took, so where it belongs on a waterfall is `createdAt - duration` to
 * `createdAt`. That was not true until entries stopped being stamped at the
 * moment they were written: a buffered entry carried the time of the flush,
 * which put a whole busy second on one instant.
 *
 * The window is taken from the entries themselves rather than from the
 * request, because a query can finish after the response is sent — a fire and
 * forget write, a log from a callback — and a chart that clipped those would
 * hide exactly the thing somebody opened it to find.
 */
export default function RequestTimeline({ request, related }: RequestTimelineProps) {
  const { spans, window } = useMemo(() => {
    const all = [request, ...related];

    const measured: Span[] = all.map((entry) => {
      const end = parseDate(entry.createdAt).getTime();
      const duration = Number((entry.payload as { duration?: number }).duration ?? 0);
      const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

      return { entry, offset: end - safeDuration, duration: safeDuration, label: labelFor(entry) };
    });

    const starts = measured.map((span) => span.offset);
    const ends = measured.map((span) => span.offset + span.duration);
    const first = Math.min(...starts);
    const last = Math.max(...ends);

    return {
      // A request that took no measurable time still needs a width to divide
      // by; one millisecond keeps every bar visible rather than infinite.
      window: Math.max(1, last - first),
      spans: measured
        .map((span) => ({ ...span, offset: span.offset - first }))
        .sort((a, b) => a.offset - b.offset || a.duration - b.duration),
    };
  }, [request, related]);

  if (spans.length <= 1) {
    return null;
  }

  return (
    <div className="card overflow-hidden" data-testid="request-timeline">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Timeline</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {spans.length} entries over {formatMs(window)}
        </span>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {spans.map((span) => {
          // A zero-length span would be invisible, so it keeps a sliver: the
          // point of the row is that it happened here, not that it lasted.
          const width = Math.min(Math.max((span.duration / window) * 100, 0.75), 100);
          // Pushed back far enough for the sliver to fit rather than trimmed to
          // nothing against the right edge. The last thing to happen in a
          // request is usually the request itself, and its row was blank.
          const left = Math.min((span.offset / window) * 100, 100 - width);
          const colour = BAR_COLOURS[span.entry.type] ?? 'bg-gray-400';

          return (
            <Link
              key={`${span.entry.type}-${span.entry.id}`}
              to={`/entries/${span.entry.id}`}
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="w-24 shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400 capitalize">
                {span.entry.type}
              </span>

              <span
                className="flex-1 min-w-0 text-sm font-mono text-gray-700 dark:text-gray-300 truncate"
                title={span.label}
              >
                {span.label}
              </span>

              <span className="relative w-1/2 shrink-0 h-4 rounded bg-gray-100 dark:bg-gray-800">
                <span
                  className={`absolute top-0 h-full rounded ${colour}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  data-testid="timeline-bar"
                />
              </span>

              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {span.duration > 0 ? formatMs(span.duration) : ''}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
