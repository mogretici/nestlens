import { format, formatDistanceToNow } from 'date-fns';
import { ExceptionEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import StackTraceViewer from './StackTraceViewer';

interface ExceptionDetailViewProps {
  entry: ExceptionEntry;
}

export default function ExceptionDetailView({ entry }: ExceptionDetailViewProps) {
  const { payload, createdAt } = entry;
  const requestBodyToolbar = useJsonToolbar();

  const requestBodyTabs = payload.request?.body ? [
    {
      id: 'request-body',
      label: 'Request Body',
      content: (
        <ControlledInlineJson
          data={payload.request.body as JsonValue}
          toolbarState={requestBodyToolbar.state}
          searchBar={requestBodyToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Exception Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Exception Details
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
            {payload.context && (
              <DetailRow
                label="Context"
                value={payload.context}
              />
            )}
            <DetailRow
              label="Exception"
              value={
                <ClickableBadge listType="exceptions" filterType="names" filterValue={payload.name}>
                  {payload.name}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Message"
              value={
                <span className="text-red-600 dark:text-red-400 font-medium">
                  {payload.message}
                </span>
              }
            />
            {payload.code !== undefined && (
              <DetailRow
                label="Error Code"
                value={
                  <code className="text-sm font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                    {payload.code}
                  </code>
                }
              />
            )}
          </dl>
        </div>
      </div>

      {/* Request Info (if available) */}
      {payload.request && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Request Context
            </h2>
          </div>
          <div className="p-4">
            <dl className="divide-y-0">
              <DetailRow
                label="Method"
                value={
                  <ClickableBadge listType="exceptions" filterType="methods" filterValue={payload.request.method}>
                    {payload.request.method}
                  </ClickableBadge>
                }
              />
              <DetailRow
                label="URL"
                value={
                  <ClickableBadge listType="exceptions" filterType="paths" filterValue={payload.request.url} className="font-mono">
                    {payload.request.url}
                  </ClickableBadge>
                }
              />
            </dl>
          </div>
        </div>
      )}

      {/* Request Body */}
      {requestBodyTabs.length > 0 && (
        <Tabs
          tabs={requestBodyTabs}
          defaultTab="request-body"
          headerRight={<requestBodyToolbar.Toolbar data={payload.request?.body as JsonValue} />}
        />
      )}

      {/* Stack Trace */}
      {payload.stack && (
        <StackTraceViewer stack={payload.stack} initialFrames={5} />
      )}
    </div>
  );
}
