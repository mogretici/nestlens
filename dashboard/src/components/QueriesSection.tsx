import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QueryEntry } from '../types';
import ClickableBadge from './ClickableBadge';

interface QueriesSectionProps {
  queries: QueryEntry[];
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1 ms';
  return `${ms.toFixed(2)} ms`;
}

function truncateQuery(query: string, maxLength: number = 60): string {
  if (query.length <= maxLength) return query;
  return query.substring(0, maxLength) + '...';
}

export default function QueriesSection({ queries }: QueriesSectionProps) {
  if (!queries || queries.length === 0) {
    return null;
  }

  // Calculate stats
  const totalDuration = queries.reduce((sum, q) => sum + q.payload.duration, 0);
  const uniqueQueries = new Set(queries.map((q) => q.payload.query)).size;
  const duplicateCount = queries.length - uniqueQueries;

  return (
    <div className="card">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Queries ({queries.length})
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {queries.length} queries, {duplicateCount} of which are duplicated
          </p>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          Total: <span className="font-medium">{formatDuration(totalDuration)}</span>
        </div>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {queries.map((query) => (
          <Link
            key={query.id}
            to={`/entry/${query.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
          >
            <div className="flex-1 min-w-0 mr-4">
              <code className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate block">
                {truncateQuery(query.payload.query)}
              </code>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {query.payload.slow && (
                <ClickableBadge listType="queries">SLOW</ClickableBadge>
              )}
              <span
                className={`text-sm font-mono ${
                  query.payload.slow
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {formatDuration(query.payload.duration)}
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
