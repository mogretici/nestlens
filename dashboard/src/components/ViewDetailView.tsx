import { format, formatDistanceToNow } from 'date-fns';
import { Eye, Clock, CheckCircle, XCircle, FileText } from 'lucide-react';
import { ViewEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface ViewDetailViewProps {
  entry: ViewEntry;
}

export default function ViewDetailView({ entry }: ViewDetailViewProps) {
  const { payload, createdAt } = entry;
  const dataToolbar = useJsonToolbar();

  const statusConfig = payload.status === 'rendered'
    ? { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' }
    : { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' };
  const StatusIcon = statusConfig.icon;

  // Build tabs
  const tabs = [];

  if (payload.locals !== undefined) {
    tabs.push({
      id: 'locals',
      label: 'Locals',
      content: (
        <ControlledInlineJson
          data={payload.locals as JsonValue}
          toolbarState={dataToolbar.state}
          searchBar={dataToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    });
  }

  return (
    <div className="space-y-6">
      {/* View Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${statusConfig.bg} rounded-lg`}>
                <Eye className={`h-5 w-5 ${statusConfig.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                  {payload.template}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  View Render
                </p>
              </div>
            </div>
            <CopyButton text={payload.template} label="Copy template" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Format</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white font-mono">
              {payload.format || 'HTML'}
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
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.duration}<span className="text-sm font-normal text-gray-500 dark:text-gray-400">ms</span>
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Cache</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.cacheHit ? 'Yes' : 'No'}
            </p>
          </div>
        </div>
      </div>

      {/* View Details Card */}
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
              label="Template"
              value={
                <code className="text-sm font-mono text-gray-900 dark:text-white">
                  {payload.template}
                </code>
              }
            />
            {payload.format && (
              <DetailRow
                label="Format"
                value={
                  <ClickableBadge listType="views" filterType="formats" filterValue={payload.format}>
                    {payload.format}
                  </ClickableBadge>
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="views" filterType="statuses" filterValue={payload.status}>
                  {payload.status.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {payload.cacheHit !== undefined && (
              <DetailRow
                label="Cached"
                value={payload.cacheHit ? 'Yes' : 'No'}
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

      {/* Locals Tab */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab="locals"
          hashKey="view"
          headerRight={payload.locals !== undefined ? <dataToolbar.Toolbar data={payload.locals as JsonValue} /> : undefined}
        />
      )}
    </div>
  );
}
