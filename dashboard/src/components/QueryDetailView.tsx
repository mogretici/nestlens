import { format, formatDistanceToNow } from 'date-fns';
import { QueryEntry } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import SqlViewer from './SqlViewer';

interface QueryDetailViewProps {
  entry: QueryEntry;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function QueryDetailView({ entry }: QueryDetailViewProps) {
  const { payload, createdAt } = entry;

  return (
    <div className="space-y-6">
      {/* Query Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Query Details
          </h2>
        </div>
        <div className="p-4">
          <dl className="divide-y-0">
            <DetailRow
              label="Time"
              value={
                <span>
                  {format(parseDate(createdAt), "MMMM do yyyy, h:mm:ss a")}{' '}
                  <span className="text-gray-500 dark:text-gray-400">
                    ({formatDistanceToNow(parseDate(createdAt), { addSuffix: true })})
                  </span>
                </span>
              }
            />
            <DetailRow
              label="Source"
              value={
                <ClickableBadge listType="queries" filterType="sources" filterValue={payload.source} clickable={!!payload.source}>
                  {payload.source || 'unknown'}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Connection"
              value={payload.connection || 'default'}
            />
            <DetailRow
              label="Duration"
              value={
                <span className={payload.slow ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                  {formatDuration(payload.duration)}
                </span>
              }
            />
            <DetailRow
              label="Status"
              value={
                payload.slow ? (
                  <ClickableBadge listType="queries">
                    SLOW
                  </ClickableBadge>
                ) : (
                  <span className="text-gray-600 dark:text-gray-400">Normal</span>
                )
              }
            />
          </dl>
        </div>
      </div>

      {/* SQL Query with Parameters */}
      <SqlViewer
        query={payload.query}
        parameters={payload.parameters}
        duration={payload.duration}
        slow={payload.slow}
      />
    </div>
  );
}
