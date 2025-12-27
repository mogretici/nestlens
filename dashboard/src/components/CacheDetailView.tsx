import { format, formatDistanceToNow } from 'date-fns';
import { Database, Clock, Key, CheckCircle, XCircle, Timer } from 'lucide-react';
import { CacheEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface CacheDetailViewProps {
  entry: CacheEntry;
}

const operationConfig = {
  get: { label: 'GET', color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  set: { label: 'SET', color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  del: { label: 'DELETE', color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  clear: { label: 'CLEAR', color: 'text-orange-500', bg: 'bg-orange-100 dark:bg-orange-900/30' },
};

function formatTTL(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function CacheDetailView({ entry }: CacheDetailViewProps) {
  const { payload, createdAt } = entry;
  const valueToolbar = useJsonToolbar();

  const config = operationConfig[payload.operation] || operationConfig.get;

  // Build tabs
  const tabs = payload.value !== undefined ? [
    {
      id: 'value',
      label: 'Value',
      content: (
        <ControlledInlineJson
          data={payload.value as JsonValue}
          toolbarState={valueToolbar.state}
          searchBar={valueToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Cache Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${config.bg} rounded-lg`}>
                <Database className={`h-5 w-5 ${config.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {config.label}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Cache Operation
                </p>
              </div>
            </div>
            <CopyButton text={payload.key} label="Copy cache key" />
          </div>
        </div>

        {/* Stats Row */}
        <div className={`grid ${payload.operation === 'get' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'} divide-x divide-gray-200 dark:divide-gray-700`}>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Database className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Operation</span>
            </div>
            <p className={`text-lg font-bold ${config.color}`}>
              {config.label}
            </p>
          </div>
          {payload.operation === 'get' && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                {payload.hit ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="text-xs uppercase tracking-wider">Result</span>
              </div>
              <p className={`text-lg font-bold ${payload.hit ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                {payload.hit ? 'HIT' : 'MISS'}
              </p>
            </div>
          )}
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.duration}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span>
            </p>
          </div>
          {payload.ttl !== undefined && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                <Timer className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">TTL</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {formatTTL(payload.ttl)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cache Details Card */}
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
                <ClickableBadge listType="cache" filterType="operations" filterValue={payload.operation}>
                  {payload.operation.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Key"
              value={
                <div className="flex items-center space-x-2">
                  <Key className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <code className="text-sm font-mono text-gray-900 dark:text-white break-all">
                    {payload.key}
                  </code>
                </div>
              }
            />
            {payload.operation === 'get' && (
              <DetailRow
                label="Result"
                value={
                  <ClickableBadge listType="cache" filterType="tags" filterValue={payload.hit ? 'hit' : 'miss'}>
                    {payload.hit ? 'HIT' : 'MISS'}
                  </ClickableBadge>
                }
              />
            )}
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {payload.ttl !== undefined && (
              <DetailRow
                label="TTL"
                value={`${payload.ttl}s (${formatTTL(payload.ttl)})`}
              />
            )}
          </dl>
        </div>
      </div>

      {/* Value Tab */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab="value"
          hashKey="cache"
          headerRight={<valueToolbar.Toolbar data={payload.value as JsonValue} />}
        />
      )}
    </div>
  );
}
