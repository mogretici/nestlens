import { format, formatDistanceToNow } from 'date-fns';
import { HardDrive, CheckCircle, XCircle, FileText, Database, Lock, Archive, Clock } from 'lucide-react';
import { DumpEntry } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import CopyButton from './CopyButton';

interface DumpDetailViewProps {
  entry: DumpEntry;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

const operationColors: Record<string, string> = {
  export: 'text-blue-600 dark:text-blue-400',
  import: 'text-purple-600 dark:text-purple-400',
  backup: 'text-green-600 dark:text-green-400',
  restore: 'text-orange-600 dark:text-orange-400',
  migrate: 'text-cyan-600 dark:text-cyan-400',
};

export default function DumpDetailView({ entry }: DumpDetailViewProps) {
  const { payload, createdAt } = entry;

  const statusConfig = payload.status === 'completed'
    ? { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' }
    : { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' };
  const StatusIcon = statusConfig.icon;

  const operationColor = operationColors[payload.operation] || 'text-gray-600 dark:text-gray-400';

  return (
    <div className="space-y-6">
      {/* Dump Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${statusConfig.bg} rounded-lg`}>
                <HardDrive className={`h-5 w-5 ${statusConfig.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {payload.operation.toUpperCase()} - {payload.format}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Data Dump
                </p>
              </div>
            </div>
            {(payload.source || payload.destination) && <CopyButton text={payload.destination || payload.source || ''} label="Copy path" />}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <HardDrive className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Operation</span>
            </div>
            <p className={`text-lg font-bold ${operationColor}`}>
              {payload.operation.toUpperCase()}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <StatusIcon className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Status</span>
            </div>
            <p className={`text-lg font-bold ${statusConfig.color}`}>
              {payload.status.toUpperCase()}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Database className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Records</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.recordCount !== undefined ? payload.recordCount.toLocaleString() : '-'}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Size</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatSize(payload.fileSize)}
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
        </div>
      </div>

      {/* Dump Details Card */}
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
              label="Operation"
              value={
                <ClickableBadge listType="dumps" filterType="operations" filterValue={payload.operation}>
                  {payload.operation.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Format"
              value={
                <ClickableBadge listType="dumps" filterType="formats" filterValue={payload.format}>
                  {payload.format}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="dumps" filterType="statuses" filterValue={payload.status}>
                  {payload.status.toUpperCase()}
                </ClickableBadge>
              }
            />
            {payload.source && (
              <DetailRow
                label="Source"
                value={
                  <code className="text-sm font-mono text-gray-900 dark:text-white break-all">
                    {payload.source}
                  </code>
                }
              />
            )}
            {payload.destination && (
              <DetailRow
                label="Destination"
                value={
                  <code className="text-sm font-mono text-gray-900 dark:text-white break-all">
                    {payload.destination}
                  </code>
                }
              />
            )}
            {payload.recordCount !== undefined && (
              <DetailRow
                label="Records"
                value={payload.recordCount.toLocaleString()}
              />
            )}
            <DetailRow
              label="Size"
              value={formatSize(payload.fileSize)}
            />
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {payload.compressed && (
              <DetailRow
                label="Compressed"
                value={
                  <span className="inline-flex items-center space-x-1">
                    <Archive className="h-4 w-4 text-blue-500" />
                    <span>Yes</span>
                  </span>
                }
              />
            )}
            {payload.encrypted && (
              <DetailRow
                label="Encrypted"
                value={
                  <span className="inline-flex items-center space-x-1">
                    <Lock className="h-4 w-4 text-green-500" />
                    <span>Yes</span>
                  </span>
                }
              />
            )}
          </dl>
        </div>
      </div>

      {/* Error Card (if failed) */}
      {payload.error && (
        <div className="card border-red-200 dark:border-red-800">
          <div className="px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <div className="flex items-center space-x-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">
                Error
              </h2>
            </div>
          </div>
          <div className="p-4 bg-red-50/50 dark:bg-red-900/10">
            <pre className="text-sm text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap overflow-x-auto">
              {payload.error}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
