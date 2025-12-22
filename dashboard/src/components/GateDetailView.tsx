import { format, formatDistanceToNow } from 'date-fns';
import { Shield, CheckCircle, XCircle, User, Clock } from 'lucide-react';
import { GateEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface GateDetailViewProps {
  entry: GateEntry;
}

export default function GateDetailView({ entry }: GateDetailViewProps) {
  const { payload, createdAt } = entry;
  const contextToolbar = useJsonToolbar();

  const resultConfig = payload.allowed
    ? { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30', label: 'allowed' }
    : { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30', label: 'denied' };
  const ResultIcon = resultConfig.icon;

  // Build tabs
  const tabs = payload.context ? [
    {
      id: 'context',
      label: 'Context',
      content: (
        <ControlledInlineJson
          data={payload.context as JsonValue}
          toolbarState={contextToolbar.state}
          searchBar={contextToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Gate Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${resultConfig.bg} rounded-lg`}>
                <Shield className={`h-5 w-5 ${resultConfig.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {payload.gate}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Authorization Gate
                </p>
              </div>
            </div>
            <CopyButton text={payload.gate} label="Copy gate name" />
          </div>
        </div>

        {/* Stats Row */}
        <div className={`grid ${payload.userId ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'} divide-x divide-gray-200 dark:divide-gray-700`}>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Shield className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Gate</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white truncate" title={payload.gate}>
              {payload.gate}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <ResultIcon className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Result</span>
            </div>
            <p className={`text-lg font-bold ${resultConfig.color}`}>
              {resultConfig.label}
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
          {payload.userId && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                <User className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">User</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white truncate">
                {payload.userId}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Gate Details Card */}
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
              label="Gate"
              value={
                <ClickableBadge listType="gates" filterType="gateNames" filterValue={payload.gate}>
                  {payload.gate}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Action"
              value={payload.action}
            />
            <DetailRow
              label="Result"
              value={
                <ClickableBadge listType="gates" filterType="gateResults" filterValue={resultConfig.label}>
                  {resultConfig.label}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {payload.userId && (
              <DetailRow
                label="User ID"
                value={String(payload.userId)}
              />
            )}
            {payload.subject && (
              <DetailRow
                label="Subject"
                value={payload.subject}
              />
            )}
            {payload.reason && (
              <DetailRow
                label="Reason"
                value={payload.reason}
              />
            )}
          </dl>
        </div>
      </div>

      {/* Context Tab */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab="context"
          hashKey="gate"
          headerRight={<contextToolbar.Toolbar data={payload.context as JsonValue} />}
        />
      )}
    </div>
  );
}
