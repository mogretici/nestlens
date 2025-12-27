import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Briefcase, Clock, RefreshCw, AlertCircle, CheckCircle, Hourglass } from 'lucide-react';
import { JobEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface JobDetailViewProps {
  entry: JobEntry;
}

const statusConfig = {
  waiting: { icon: Hourglass, color: 'text-gray-500', bg: 'bg-gray-100 dark:bg-gray-800' },
  active: { icon: RefreshCw, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' },
  failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' },
  delayed: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

export default function JobDetailView({ entry }: JobDetailViewProps) {
  const { payload, createdAt } = entry;
  const dataToolbar = useJsonToolbar();
  const resultToolbar = useJsonToolbar();
  const [activeTab, setActiveTab] = useState('data');

  const config = statusConfig[payload.status] || statusConfig.waiting;
  const StatusIcon = config.icon;

  // Build tabs
  const tabs = [
    {
      id: 'data',
      label: 'Job Data',
      content: payload.data ? (
        <ControlledInlineJson
          data={payload.data as JsonValue}
          toolbarState={dataToolbar.state}
          searchBar={dataToolbar.SearchBar}
          maxHeight={400}
        />
      ) : (
        <div className="p-4 text-center py-8 text-gray-500 dark:text-gray-400">
          No job data
        </div>
      ),
    },
  ];

  // Add result tab if available
  if (payload.result !== undefined) {
    tabs.push({
      id: 'result',
      label: 'Result',
      content: (
        <ControlledInlineJson
          data={payload.result as JsonValue}
          toolbarState={resultToolbar.state}
          searchBar={resultToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    });
  }

  // Get toolbar for current tab
  const getCurrentToolbar = () => {
    if (activeTab === 'data' && payload.data) {
      return <dataToolbar.Toolbar data={payload.data as JsonValue} />;
    }
    if (activeTab === 'result' && payload.result !== undefined) {
      return <resultToolbar.Toolbar data={payload.result as JsonValue} />;
    }
    return undefined;
  };

  return (
    <div className="space-y-6">
      {/* Job Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${config.bg} rounded-lg`}>
                <Briefcase className={`h-5 w-5 ${config.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                  {payload.name}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Job Details
                </p>
              </div>
            </div>
            <CopyButton text={payload.name} label="Copy job name" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <StatusIcon className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Status</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`text-lg font-bold ${
                payload.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                payload.status === 'failed' ? 'text-red-600 dark:text-red-400' :
                payload.status === 'active' ? 'text-blue-600 dark:text-blue-400' :
                'text-gray-900 dark:text-white'
              }`}>
                {payload.status.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Clock className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Duration</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.duration ? formatDuration(payload.duration) : '-'}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <RefreshCw className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Attempts</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {payload.attempts}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Briefcase className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Queue</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white truncate" title={payload.queue}>
              {payload.queue}
            </p>
          </div>
        </div>
      </div>

      {/* Job Details Card */}
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
              label="Job Name"
              value={
                <ClickableBadge listType="jobs" filterType="names" filterValue={payload.name} className="font-mono">
                  {payload.name}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Queue"
              value={
                <ClickableBadge listType="jobs" filterType="queues" filterValue={payload.queue}>
                  {payload.queue}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="jobs" filterType="statuses" filterValue={payload.status}>
                  {payload.status.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Attempts"
              value={String(payload.attempts)}
            />
            {payload.duration !== undefined && (
              <DetailRow
                label="Duration"
                value={formatDuration(payload.duration)}
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
              <AlertCircle className="h-5 w-5 text-red-500" />
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

      {/* Data & Result Tabs */}
      <Tabs
        tabs={tabs}
        defaultTab="data"
        hashKey="job"
        headerRight={getCurrentToolbar()}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
