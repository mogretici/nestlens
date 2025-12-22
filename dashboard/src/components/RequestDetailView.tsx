import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { RequestEntry, Entry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge, { BadgeList } from './ClickableBadge';
import Tabs from './Tabs';
import UserCard from './UserCard';
import RelatedEntries from './RelatedEntries';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';

interface RequestDetailViewProps {
  entry: RequestEntry;
  related?: Entry[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function extractHostname(url: string, headers: Record<string, string>): string {
  // Try to get from headers first (case-insensitive lookup)
  if (headers) {
    const hostKey = Object.keys(headers).find(k => k.toLowerCase() === 'host');
    if (hostKey && headers[hostKey]) return headers[hostKey];
  }
  // Try to parse from URL
  try {
    const urlObj = new URL(url);
    return urlObj.host;
  } catch {
    return '-';
  }
}

// Get display method - GRAPHQL for GraphQL endpoints, otherwise HTTP method
function getDisplayMethod(path: string, method: string): string {
  if (path?.toLowerCase().includes('/graphql')) {
    return 'GRAPHQL';
  }
  return method.toUpperCase();
}

export default function RequestDetailView({ entry, related = [] }: RequestDetailViewProps) {
  const { payload, createdAt } = entry;
  const hostname = extractHostname(payload.url, payload.headers);
  const displayMethod = getDisplayMethod(payload.path, payload.method);

  // Filter out method from tags (already shown in header)
  const tags = (entry.tags || []).filter(t => t.toUpperCase() !== displayMethod);

  // Toolbar states for request and response tabs
  const requestToolbar = useJsonToolbar();
  const responseToolbar = useJsonToolbar();

  // Track active tabs for copy functionality
  const [activeRequestTab, setActiveRequestTab] = useState('payload');
  const [activeResponseTab, setActiveResponseTab] = useState('response');

  // Build payload content for request tab
  const payloadContent: Record<string, unknown> = {};
  if (payload.body) {
    payloadContent.body = payload.body;
  }
  if (payload.query && Object.keys(payload.query).length > 0) {
    payloadContent.query = payload.query;
  }
  if (payload.params && Object.keys(payload.params).length > 0) {
    payloadContent.params = payload.params;
  }

  // Data for each tab
  const requestData = {
    payload: (Object.keys(payloadContent).length > 0 ? payloadContent : {}) as JsonValue,
    headers: (payload.headers || {}) as JsonValue,
  };

  const responseData = {
    response: (payload.responseBody || {}) as JsonValue,
    'response-headers': (payload.responseHeaders || {}) as JsonValue,
    session: (payload.session && Object.keys(payload.session).length > 0 ? payload.session : {}) as JsonValue,
  };

  // Request tabs - always show both Payload and Headers
  const requestTabs = [
    {
      id: 'payload',
      label: 'Payload',
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
      label: 'Headers',
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

  // Response tabs - always show Response, Headers, and Session
  const responseTabs = [
    {
      id: 'response',
      label: 'Response',
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
      id: 'response-headers',
      label: 'Headers',
      content: (
        <ControlledInlineJson
          data={responseData['response-headers']}
          toolbarState={responseToolbar.state}
          searchBar={responseToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
    {
      id: 'session',
      label: 'Session',
      content: (
        <ControlledInlineJson
          data={responseData.session}
          toolbarState={responseToolbar.state}
          searchBar={responseToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Request Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Request Details
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
              label="Hostname"
              value={
                hostname !== '-' ? (
                  <ClickableBadge listType="requests" filterType="hostnames" filterValue={hostname} className="font-mono">
                    {hostname}
                  </ClickableBadge>
                ) : '-'
              }
            />
            {payload.controllerAction && (
              <DetailRow
                label="Controller Action"
                value={
                  <ClickableBadge listType="requests" filterType="controllers" filterValue={payload.controllerAction} className="font-mono">
                    {payload.controllerAction}
                  </ClickableBadge>
                }
              />
            )}
            <DetailRow
              label="Path"
              value={
                <ClickableBadge listType="requests" filterType="path" filterValue={payload.path} className="font-mono">
                  {payload.path}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Status"
              value={
                payload.statusCode ? (
                  <ClickableBadge listType="requests" filterType="statuses" filterValue={String(payload.statusCode)}>
                    {String(payload.statusCode)}
                  </ClickableBadge>
                ) : (
                  '-'
                )
              }
            />
            <DetailRow
              label="Duration"
              value={
                payload.duration !== undefined ? (
                  <span className={payload.duration > 1000 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}>
                    {formatDuration(payload.duration)}
                  </span>
                ) : (
                  '-'
                )
              }
            />
            <DetailRow
              label="IP Address"
              value={
                payload.ip ? (
                  <ClickableBadge listType="requests" filterType="ips" filterValue={payload.ip} className="font-mono">
                    {payload.ip}
                  </ClickableBadge>
                ) : '-'
              }
            />
            <DetailRow
              label="Memory Usage"
              value={
                payload.memory !== undefined ? (
                  formatBytes(payload.memory)
                ) : (
                  '-'
                )
              }
            />
            {tags.length > 0 && (
              <DetailRow
                label="Tags"
                value={
                  <BadgeList items={tags} listType="requests" maxItems={99} />
                }
              />
            )}
          </dl>
        </div>
      </div>

      {/* Authenticated User Card */}
      {payload.user && (
        <UserCard user={payload.user} />
      )}

      {/* Request Tabs (Payload | Headers) */}
      <Tabs
        tabs={requestTabs}
        defaultTab="payload"
        hashKey="req"
        headerRight={<requestToolbar.Toolbar data={requestData[activeRequestTab as keyof typeof requestData]} />}
        onTabChange={setActiveRequestTab}
      />

      {/* Response Tabs (Response | Headers | Session) */}
      <Tabs
        tabs={responseTabs}
        defaultTab="response"
        hashKey="res"
        headerRight={<responseToolbar.Toolbar data={responseData[activeResponseTab as keyof typeof responseData]} />}
        onTabChange={setActiveResponseTab}
      />

      {/* Related Entries (Exceptions, Logs, Queries, Events, Jobs, Cache, Mails) */}
      <RelatedEntries entries={related} />
    </div>
  );
}
