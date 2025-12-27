import { format, formatDistanceToNow } from 'date-fns';
import { Layers, Clock, CheckCircle, XCircle, AlertCircle, Activity } from 'lucide-react';
import { BatchEntry } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import CopyButton from './CopyButton';

interface BatchDetailViewProps {
  entry: BatchEntry;
}

const statusConfig = {
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  partial: { icon: AlertCircle, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
};

function formatBytes(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export default function BatchDetailView({ entry }: BatchDetailViewProps) {
  const { payload, createdAt } = entry;
  const config = statusConfig[payload.status] || statusConfig.completed;
  const StatusIcon = config.icon;

  const { processedItems, totalItems, failedItems } = payload;
  const percentage = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Batch Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${config.bg} rounded-lg`}>
                <Layers className={`h-5 w-5 ${config.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                  {payload.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Batch Operation
                </p>
              </div>
            </div>
            <CopyButton text={payload.name} label="Copy batch name" />
          </div>
        </div>

        {/* Stats Row */}
        <div className={`grid ${payload.memory !== undefined ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-2 md:grid-cols-4'} divide-x divide-gray-200 dark:divide-gray-700`}>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <StatusIcon className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Status</span>
            </div>
            <p className={`text-lg font-bold ${config.color}`}>
              {payload.status.toUpperCase()}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Activity className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Progress</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {percentage}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">%</span>
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.duration}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span>
            </p>
          </div>
          {failedItems > 0 && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                <XCircle className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Failed</span>
              </div>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {failedItems}
              </p>
            </div>
          )}
          {payload.memory !== undefined && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Memory</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatBytes(payload.memory)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Batch Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Details
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
              label="Name"
              value={
                <code className="text-sm font-mono text-gray-900 dark:text-white">
                  {payload.name}
                </code>
              }
            />
            {payload.operation && (
              <DetailRow
                label="Operation"
                value={
                  <ClickableBadge listType="batches" filterType="operations" filterValue={payload.operation}>
                    {payload.operation}
                  </ClickableBadge>
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="batches" filterType="statuses" filterValue={payload.status}>
                  {payload.status.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Progress"
              value={
                <div>
                  <div className="text-sm font-mono">
                    {processedItems} / {totalItems} ({percentage}%)
                  </div>
                  <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              }
            />
            {failedItems > 0 && (
              <DetailRow
                label="Failed Items"
                value={<span className="text-red-600 dark:text-red-400 font-mono">{failedItems}</span>}
              />
            )}
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {payload.batchSize && (
              <DetailRow
                label="Batch Size"
                value={payload.batchSize}
              />
            )}
            {payload.memory !== undefined && (
              <DetailRow
                label="Memory"
                value={formatBytes(payload.memory)}
              />
            )}
          </dl>
        </div>
      </div>

      {/* Errors Card (if any) */}
      {payload.errors && payload.errors.length > 0 && (
        <div className="card border-red-200 dark:border-red-800">
          <div className="px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                Errors ({payload.errors.length})
              </h2>
            </div>
          </div>
          <div className="divide-y divide-red-200 dark:divide-red-800">
            {payload.errors.map((error, idx) => (
              <div key={idx} className="p-4 bg-red-50/50 dark:bg-red-900/10">
                <pre className="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap overflow-x-auto">
                  {error}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
