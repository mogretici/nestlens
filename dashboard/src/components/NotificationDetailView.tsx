import { format, formatDistanceToNow } from 'date-fns';
import { Bell, Clock, CheckCircle, XCircle, Send } from 'lucide-react';
import { NotificationEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface NotificationDetailViewProps {
  entry: NotificationEntry;
}

export default function NotificationDetailView({ entry }: NotificationDetailViewProps) {
  const { payload, createdAt } = entry;
  const dataToolbar = useJsonToolbar();

  const statusConfig = payload.status === 'sent'
    ? { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' }
    : { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' };
  const StatusIcon = statusConfig.icon;

  // Build tabs
  const tabs = payload.metadata !== undefined ? [
    {
      id: 'metadata',
      label: 'Metadata',
      content: (
        <ControlledInlineJson
          data={payload.metadata as JsonValue}
          toolbarState={dataToolbar.state}
          searchBar={dataToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ] : [];

  // Format recipients for display
  const recipients = Array.isArray(payload.recipient) ? payload.recipient : [payload.recipient];

  return (
    <div className="space-y-6">
      {/* Notification Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${statusConfig.bg} rounded-lg`}>
                <Bell className={`h-5 w-5 ${statusConfig.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {payload.title || payload.type}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Notification
                </p>
              </div>
            </div>
            <CopyButton text={recipients.join(', ')} label="Copy recipient" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Bell className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Type</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white truncate" title={payload.type}>
              {payload.type}
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
              <Send className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Recipients</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {recipients.length}
            </p>
          </div>
        </div>
      </div>

      {/* Notification Details Card */}
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
              label="Type"
              value={
                <ClickableBadge listType="notifications" filterType="types" filterValue={payload.type}>
                  {payload.type}
                </ClickableBadge>
              }
            />
            <DetailRow
              label={recipients.length > 1 ? 'Recipients' : 'Recipient'}
              value={
                <div className="flex flex-wrap gap-2">
                  {recipients.map((r, idx) => (
                    <code key={idx} className="text-sm font-mono text-gray-900 dark:text-white">
                      {r}
                    </code>
                  ))}
                </div>
              }
            />
            {payload.title && (
              <DetailRow
                label="Title"
                value={payload.title}
              />
            )}
            {payload.message && (
              <DetailRow
                label="Message"
                value={
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {payload.message}
                  </span>
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="notifications" filterType="statuses" filterValue={payload.status}>
                  {payload.status.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
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

      {/* Metadata Tab */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab="metadata"
          hashKey="notification"
          headerRight={<dataToolbar.Toolbar data={payload.metadata as JsonValue} />}
        />
      )}
    </div>
  );
}
