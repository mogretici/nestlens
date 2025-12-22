import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Database, Clock, CheckCircle, XCircle, Terminal } from 'lucide-react';
import { RedisEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface RedisDetailViewProps {
  entry: RedisEntry;
}

export default function RedisDetailView({ entry }: RedisDetailViewProps) {
  const { payload, createdAt } = entry;
  const argsToolbar = useJsonToolbar();
  const resultToolbar = useJsonToolbar();
  const [activeTab, setActiveTab] = useState('args');

  const statusConfig = payload.status === 'success'
    ? { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-100 dark:bg-green-900/30' }
    : { icon: XCircle, color: 'text-red-500', bg: 'bg-red-100 dark:bg-red-900/30' };
  const StatusIcon = statusConfig.icon;

  // Build tabs
  const tabs = [];

  if (payload.args && payload.args.length > 0) {
    tabs.push({
      id: 'args',
      label: 'Arguments',
      content: (
        <ControlledInlineJson
          data={payload.args as JsonValue}
          toolbarState={argsToolbar.state}
          searchBar={argsToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    });
  }

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
    if (activeTab === 'args' && payload.args && payload.args.length > 0) {
      return <argsToolbar.Toolbar data={payload.args as JsonValue} />;
    }
    if (activeTab === 'result' && payload.result !== undefined) {
      return <resultToolbar.Toolbar data={payload.result as JsonValue} />;
    }
    return undefined;
  };

  return (
    <div className="space-y-6">
      {/* Redis Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`p-2 ${statusConfig.bg} rounded-lg`}>
                <Database className={`h-5 w-5 ${statusConfig.color}`} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                  {payload.command}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Redis Command
                </p>
              </div>
            </div>
            <CopyButton text={payload.command} label="Copy command" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-3 divide-x divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Terminal className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Command</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white font-mono">
              {payload.command}
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
        </div>
      </div>

      {/* Redis Details Card */}
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
              label="Command"
              value={
                <ClickableBadge listType="redis" filterType="redisCommands" filterValue={payload.command}>
                  {payload.command}
                </ClickableBadge>
              }
            />
            {payload.keyPattern && (
              <DetailRow
                label="Key Pattern"
                value={
                  <code className="text-sm font-mono text-gray-900 dark:text-white">
                    {payload.keyPattern}
                  </code>
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <ClickableBadge listType="redis" filterType="redisStatuses" filterValue={payload.status}>
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

      {/* Data Tabs */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab="args"
          hashKey="redis"
          headerRight={getCurrentToolbar()}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
