import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { HttpClientEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge, { BadgeList } from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import { HTTP_METHODS, STATUS_PATTERNS } from '../constants/http';

interface HttpClientDetailViewProps {
  entry: HttpClientEntry;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function HttpClientDetailView({ entry }: HttpClientDetailViewProps) {
  const { payload, createdAt } = entry;

  // Filter out method, status, and hostname tags (already shown in details)
  const tags = (entry.tags || []).filter(tag => {
    const upper = tag.toUpperCase();
    return !(HTTP_METHODS as readonly string[]).includes(upper) &&
           !(STATUS_PATTERNS as readonly string[]).includes(upper) &&
           tag.toLowerCase() !== payload.hostname?.toLowerCase();
  });

  // Toolbar states for request and response tabs
  const requestToolbar = useJsonToolbar();
  const responseToolbar = useJsonToolbar();

  // Track active tabs for copy functionality
  const [activeRequestTab, setActiveRequestTab] = useState('payload');
  const [activeResponseTab, setActiveResponseTab] = useState('response');

  // Data for each tab
  const requestData = {
    payload: (payload.requestBody || {}) as JsonValue,
    headers: (payload.requestHeaders || {}) as JsonValue,
  };

  const responseData = {
    response: (payload.responseBody || {}) as JsonValue,
    headers: (payload.responseHeaders || {}) as JsonValue,
  };

  // Request tabs
  const requestTabs = [
    {
      id: 'payload',
      label: 'Request Body',
      content: (
        <ControlledInlineJson
          data={requestData.payload}
          toolbarState={requestToolbar.state}
          searchBar={requestToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
    {
      id: 'headers',
      label: 'Request Headers',
      content: (
        <ControlledInlineJson
          data={requestData.headers}
          toolbarState={requestToolbar.state}
          searchBar={requestToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ];

  // Response tabs
  const responseTabs = [
    {
      id: 'response',
      label: 'Response Body',
      content: (
        <ControlledInlineJson
          data={responseData.response}
          toolbarState={responseToolbar.state}
          searchBar={responseToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
    {
      id: 'headers',
      label: 'Response Headers',
      content: (
        <ControlledInlineJson
          data={responseData.headers}
          toolbarState={responseToolbar.state}
          searchBar={responseToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* HTTP Client Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            HTTP Client Request Details
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
              label="Method"
              value={
                <ClickableBadge listType="http-client" filterType="methods" filterValue={payload.method} className="font-mono font-medium">
                  {payload.method}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="URL"
              value={
                <span className="font-mono text-sm break-all">
                  {payload.url}
                </span>
              }
            />
            {payload.hostname && (
              <DetailRow
                label="Hostname"
                value={
                  <ClickableBadge listType="http-client" filterType="hostnames" filterValue={payload.hostname} className="font-mono">
                    {payload.hostname}
                  </ClickableBadge>
                }
              />
            )}
            {payload.path && (
              <DetailRow
                label="Path"
                value={
                  <span className="font-mono text-sm">
                    {payload.path}
                  </span>
                }
              />
            )}
            <DetailRow
              label="Status Code"
              value={
                <ClickableBadge
                  listType="http-client"
                  filterType="statuses"
                  filterValue={payload.statusCode ? String(payload.statusCode) : 'ERR'}
                >
                  {payload.statusCode || 'ERR'}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Duration"
              value={
                <span className={payload.duration > 1000 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}>
                  {formatDuration(payload.duration)}
                </span>
              }
            />
            {payload.error && (
              <DetailRow
                label="Error"
                value={
                  <span className="text-red-600 dark:text-red-400 font-medium">
                    {payload.error}
                  </span>
                }
              />
            )}
            {tags.length > 0 && (
              <DetailRow
                label="Tags"
                value={
                  <BadgeList items={tags} listType="http-client" maxItems={99} />
                }
              />
            )}
          </dl>
        </div>
      </div>

      {/* Request Tabs (Body | Headers) */}
      <Tabs
        tabs={requestTabs}
        defaultTab="payload"
        hashKey="req"
        headerRight={<requestToolbar.Toolbar data={requestData[activeRequestTab as keyof typeof requestData]} />}
        onTabChange={setActiveRequestTab}
      />

      {/* Response Tabs (Body | Headers) */}
      <Tabs
        tabs={responseTabs}
        defaultTab="response"
        hashKey="res"
        headerRight={<responseToolbar.Toolbar data={responseData[activeResponseTab as keyof typeof responseData]} />}
        onTabChange={setActiveResponseTab}
      />
    </div>
  );
}
