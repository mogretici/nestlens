import { format, formatDistanceToNow } from 'date-fns';
import { LogEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge from './ClickableBadge';
import Tabs from './Tabs';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';

interface LogDetailViewProps {
  entry: LogEntry;
}

type LogLevel = 'debug' | 'log' | 'warn' | 'error' | 'verbose';

const levelConfig: Record<LogLevel, { variant: 'default' | 'success' | 'warning' | 'error' | 'info'; label: string }> = {
  verbose: { variant: 'default', label: 'VERBOSE' },
  debug: { variant: 'info', label: 'DEBUG' },
  log: { variant: 'success', label: 'LOG' },
  warn: { variant: 'warning', label: 'WARNING' },
  error: { variant: 'error', label: 'ERROR' },
};

export default function LogDetailView({ entry }: LogDetailViewProps) {
  const { payload, createdAt } = entry;
  const config = levelConfig[payload.level] || levelConfig.log;
  const metadataToolbar = useJsonToolbar();

  const hasMetadata = payload.metadata && Object.keys(payload.metadata).length > 0;
  const metadataTabs = hasMetadata ? [
    {
      id: 'metadata',
      label: 'Metadata',
      content: (
        <ControlledInlineJson
          data={payload.metadata as JsonValue}
          toolbarState={metadataToolbar.state}
          searchBar={metadataToolbar.SearchBar}
          maxHeight={400}
        />
      ),
    },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Log Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Log Details
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
              label="Level"
              value={
                <ClickableBadge listType="logs" filterType="levels" filterValue={payload.level}>
                  {config.label}
                </ClickableBadge>
              }
            />
            {payload.context && (
              <DetailRow
                label="Context"
                value={
                  <ClickableBadge listType="logs" filterType="contexts" filterValue={payload.context} className="font-mono">
                    {payload.context}
                  </ClickableBadge>
                }
              />
            )}
          </dl>
        </div>
      </div>

      {/* Log Message */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Message
          </h2>
        </div>
        <div className="p-4">
          <p className={`text-sm ${payload.level === 'error' ? 'text-red-600 dark:text-red-400' : payload.level === 'warn' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>
            {payload.message}
          </p>
        </div>
      </div>

      {/* Metadata */}
      {metadataTabs.length > 0 && (
        <Tabs
          tabs={metadataTabs}
          defaultTab="metadata"
          headerRight={<metadataToolbar.Toolbar data={payload.metadata as JsonValue} />}
        />
      )}

      {/* Stack Trace */}
      {payload.stack && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Stack Trace
            </h2>
          </div>
          <div className="p-4 bg-gray-900 dark:bg-gray-950 overflow-x-auto">
            <pre className="text-sm text-red-400 font-mono whitespace-pre-wrap">
              {payload.stack}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
