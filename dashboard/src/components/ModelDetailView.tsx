import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { Box, Clock, Database, FileText } from 'lucide-react';
import { ModelEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import CopyButton from './CopyButton';

interface ModelDetailViewProps {
  entry: ModelEntry;
}

export default function ModelDetailView({ entry }: ModelDetailViewProps) {
  const { payload, createdAt } = entry;
  const dataToolbar = useJsonToolbar();
  const changesToolbar = useJsonToolbar();
  const [activeTab, setActiveTab] = useState('data');

  // Build tabs
  const tabs = [];

  if (payload.data !== undefined) {
    tabs.push({
      id: 'data',
      label: 'Data',
      content: (
        <ControlledInlineJson
          data={payload.data as JsonValue}
          toolbarState={dataToolbar.state}
          searchBar={dataToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    });
  }

  if (payload.changes !== undefined) {
    tabs.push({
      id: 'changes',
      label: 'Changes',
      content: (
        <ControlledInlineJson
          data={payload.changes as JsonValue}
          toolbarState={changesToolbar.state}
          searchBar={changesToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    });
  }

  // Get toolbar for current tab
  const getCurrentToolbar = () => {
    if (activeTab === 'data' && payload.data !== undefined) {
      return <dataToolbar.Toolbar data={payload.data as JsonValue} />;
    }
    if (activeTab === 'changes' && payload.changes !== undefined) {
      return <changesToolbar.Toolbar data={payload.changes as JsonValue} />;
    }
    return undefined;
  };

  return (
    <div className="space-y-6">
      {/* Model Info Card */}
      <div className="card">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Box className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                  {payload.entity}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Model Event
                </p>
              </div>
            </div>
            <CopyButton text={payload.entity} label="Copy entity name" />
          </div>
        </div>

        {/* Stats Row */}
        <div className={`grid ${payload.records !== undefined ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'} divide-x divide-gray-200 dark:divide-gray-700`}>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <FileText className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Action</span>
            </div>
            <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
              {payload.action.toUpperCase()}
            </p>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
              <Box className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">Entity</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white font-mono truncate" title={payload.entity}>
              {payload.entity}
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
          {payload.records !== undefined && (
            <div className="p-4">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 mb-1">
                <Database className="h-4 w-4" />
                <span className="text-xs uppercase tracking-wider">Records</span>
              </div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">
                {payload.records}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Model Details Card */}
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
              label="Action"
              value={
                <ClickableBadge listType="models" filterType="modelActions" filterValue={payload.action}>
                  {payload.action.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Entity"
              value={
                <ClickableBadge listType="models" filterType="entities" filterValue={payload.entity}>
                  {payload.entity}
                </ClickableBadge>
              }
            />
            {payload.source && (
              <DetailRow
                label="Source"
                value={
                  <ClickableBadge listType="models" filterType="modelSources" filterValue={payload.source}>
                    {payload.source}
                  </ClickableBadge>
                }
              />
            )}
            <DetailRow
              label="Duration"
              value={`${payload.duration}ms`}
            />
            {payload.records !== undefined && (
              <DetailRow
                label="Records"
                value={String(payload.records)}
              />
            )}
          </dl>
        </div>
      </div>

      {/* Data & Changes Tabs */}
      {tabs.length > 0 && (
        <Tabs
          tabs={tabs}
          defaultTab="data"
          hashKey="model"
          headerRight={getCurrentToolbar()}
          onTabChange={setActiveTab}
        />
      )}
    </div>
  );
}
