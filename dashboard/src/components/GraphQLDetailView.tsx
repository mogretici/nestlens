import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import { GraphQLEntry, JsonValue } from '../types';
import { parseDate } from '../utils/date';
import DetailRow from './DetailRow';
import ClickableBadge, { BadgeList } from './ClickableBadge';
import { GraphQLErrorBadge, N1WarningBadge } from './DataTable';
import Tabs from './Tabs';
import UserCard from './UserCard';
import { useJsonToolbar, ControlledInlineJson } from './JsonViewerWithToolbar';
import { useGraphQLToolbar, InlineGraphQLViewer } from './GraphQLViewer';
import { AlertTriangle, Clock, Layers, Zap } from 'lucide-react';

interface GraphQLDetailViewProps {
  entry: GraphQLEntry;
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} us`;
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}


// Timing breakdown visualization
function TimingBreakdown({
  parsing,
  validation,
  execution,
  total,
}: {
  parsing?: number;
  validation?: number;
  execution?: number;
  total: number;
}) {
  if (!parsing && !validation && !execution) return null;

  const segments = [
    { label: 'Parsing', value: parsing, color: 'bg-blue-400' },
    { label: 'Validation', value: validation, color: 'bg-purple-400' },
    { label: 'Execution', value: execution, color: 'bg-green-400' },
  ].filter((s) => s.value !== undefined && s.value > 0);

  const measured = segments.reduce((sum, s) => sum + (s.value || 0), 0);
  const unmeasured = total - measured;

  return (
    <div className="space-y-2">
      {/* Bar visualization */}
      <div className="h-3 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex">
        {segments.map((segment, i) => (
          <div
            key={i}
            className={`${segment.color} transition-all`}
            style={{ width: `${((segment.value || 0) / total) * 100}%` }}
            title={`${segment.label}: ${formatDuration(segment.value || 0)}`}
          />
        ))}
        {unmeasured > 0 && (
          <div
            className="bg-gray-300 dark:bg-gray-600"
            style={{ width: `${(unmeasured / total) * 100}%` }}
            title={`Other: ${formatDuration(unmeasured)}`}
          />
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
        {segments.map((segment, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded ${segment.color}`} />
            <span>{segment.label}: {formatDuration(segment.value || 0)}</span>
          </div>
        ))}
        {unmeasured > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded bg-gray-300 dark:bg-gray-600" />
            <span>Other: {formatDuration(unmeasured)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// N+1 Warnings section
function N1WarningsSection({ warnings }: { warnings: GraphQLEntry['payload']['potentialN1'] }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="card border-amber-200 dark:border-amber-800">
      <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
        <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Potential N+1 Queries ({warnings.length})
        </h2>
      </div>
      <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
        {warnings.map((warning, i) => (
          <div key={i} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <code className="text-sm font-mono text-amber-700 dark:text-amber-300">
                  {warning.parentType}.{warning.field}
                </code>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Called <span className="font-semibold text-amber-600 dark:text-amber-400">{warning.count} times</span>
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              {warning.suggestion}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// GraphQL Errors section
function GraphQLErrorsSection({ errors }: { errors: GraphQLEntry['payload']['errors'] }) {
  if (!errors || errors.length === 0) return null;

  return (
    <div className="card border-red-200 dark:border-red-800">
      <div className="px-4 py-3 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
          GraphQL Errors ({errors.length})
        </h2>
      </div>
      <div className="divide-y divide-red-100 dark:divide-red-900/30">
        {errors.map((error, i) => (
          <div key={i} className="p-4">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              {error.message}
            </p>
            {error.path && error.path.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                Path: {error.path.join(' > ')}
              </p>
            )}
            {error.locations && error.locations.length > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Location: {error.locations.map(l => `Line ${l.line}, Col ${l.column}`).join('; ')}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Field traces waterfall
function ResolverWaterfall({ traces, totalDuration }: { traces: GraphQLEntry['payload']['fieldTraces']; totalDuration: number }) {
  if (!traces || traces.length === 0) return null;

  // Sort by start offset
  const sortedTraces = [...traces].sort((a, b) => a.startOffset - b.startOffset);

  return (
    <div className="space-y-1">
      {sortedTraces.map((trace, i) => {
        const leftPercent = (trace.startOffset / totalDuration) * 100;
        const widthPercent = Math.max((trace.duration / totalDuration) * 100, 0.5);

        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-40 truncate text-gray-600 dark:text-gray-400 font-mono" title={trace.path}>
              {trace.fieldName}
            </div>
            <div className="flex-1 h-4 bg-gray-100 dark:bg-gray-700 rounded relative">
              <div
                className="absolute h-full bg-primary-400 dark:bg-primary-500 rounded"
                style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                title={`${trace.path}: ${formatDuration(trace.duration)}`}
              />
            </div>
            <div className="w-16 text-right text-gray-500 dark:text-gray-400 tabular-nums">
              {formatDuration(trace.duration)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GraphQLDetailView({ entry }: GraphQLDetailViewProps) {
  const navigate = useNavigate();
  const { payload, createdAt } = entry;

  // Filter out operation type from tags
  const tags = (entry.tags || []).filter(
    (t) => !['query', 'mutation', 'subscription'].includes(t.toLowerCase())
  );

  // Navigate to filtered list
  const handleFilterByErrors = () => navigate('/graphql?hasErrors=true');
  const handleFilterByN1 = () => navigate('/graphql?hasN1=true');

  // Toolbar states
  const queryToolbar = useGraphQLToolbar();
  const variablesToolbar = useJsonToolbar();
  const responseToolbar = useJsonToolbar();

  const [activeTab, setActiveTab] = useState('query');

  // Query tab content - uses GraphQLViewer with syntax highlighting and collapse
  const queryContent = (
    <InlineGraphQLViewer
      query={payload.query}
      toolbarState={queryToolbar.state}
      searchBar={queryToolbar.SearchBar}
      maxHeight={400}
    />
  );

  // Variables tab content
  const variablesContent = (
    <ControlledInlineJson
      data={(payload.variables || {}) as JsonValue}
      toolbarState={variablesToolbar.state}
      searchBar={variablesToolbar.SearchBar}
      maxHeight={400}
    />
  );

  // Response tab content
  const responseContent = (
    <ControlledInlineJson
      data={(payload.responseData || {}) as JsonValue}
      toolbarState={responseToolbar.state}
      searchBar={responseToolbar.SearchBar}
      maxHeight={400}
    />
  );

  // Errors tab content
  const errorsContent = payload.errors && payload.errors.length > 0 ? (
    <GraphQLErrorsSection errors={payload.errors} />
  ) : (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      No errors
    </div>
  );

  // Resolvers tab content
  const resolversContent = payload.fieldTraces && payload.fieldTraces.length > 0 ? (
    <div className="p-4">
      <ResolverWaterfall traces={payload.fieldTraces} totalDuration={payload.duration} />
    </div>
  ) : payload.hasErrors ? (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      <p>No resolver traces available.</p>
      <p className="text-xs mt-1">Query failed before execution phase - resolvers were not called.</p>
    </div>
  ) : (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      <p>Resolver tracing not enabled for this operation.</p>
      <p className="text-xs mt-1">Enable <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">traceFieldResolvers</code> in GraphQL watcher config.</p>
    </div>
  );

  const tabs = [
    { id: 'query', label: 'Query', content: queryContent },
    { id: 'variables', label: 'Variables', content: variablesContent },
    { id: 'response', label: 'Response', content: responseContent },
    { id: 'errors', label: `Errors${payload.errors?.length ? ` (${payload.errors.length})` : ''}`, content: errorsContent },
    { id: 'resolvers', label: 'Resolvers', content: resolversContent },
  ];

  // Toolbar for active tab
  const getToolbar = () => {
    switch (activeTab) {
      case 'query':
        return <queryToolbar.Toolbar code={payload.query} />;
      case 'variables':
        return <variablesToolbar.Toolbar data={(payload.variables || {}) as JsonValue} />;
      case 'response':
        return <responseToolbar.Toolbar data={(payload.responseData || {}) as JsonValue} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Operation Details Card */}
      <div className="card">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Operation Details
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
              label="Operation Type"
              value={
                <ClickableBadge listType="graphql" filterType="operationTypes" filterValue={payload.operationType}>
                  {payload.operationType.toUpperCase()}
                </ClickableBadge>
              }
            />
            <DetailRow
              label="Operation Name"
              value={
                payload.operationName ? (
                  <ClickableBadge listType="graphql" filterType="operationNames" filterValue={payload.operationName} className="font-mono">
                    {payload.operationName}
                  </ClickableBadge>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 italic">(anonymous)</span>
                )
              }
            />
            <DetailRow
              label="Query Hash"
              value={<code className="text-xs font-mono text-gray-500 dark:text-gray-400">{payload.queryHash}</code>}
            />
            <DetailRow
              label="Status"
              value={
                <div className="flex items-center gap-2">
                  <ClickableBadge listType="graphql" filterType="statuses" filterValue={String(payload.statusCode)}>
                    {String(payload.statusCode)}
                  </ClickableBadge>
                  {payload.hasErrors && (
                    <GraphQLErrorBadge onClick={handleFilterByErrors} />
                  )}
                  {payload.potentialN1 && payload.potentialN1.length > 0 && (
                    <N1WarningBadge count={payload.potentialN1.length} onClick={handleFilterByN1} />
                  )}
                </div>
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
            {payload.resolverCount !== undefined && (
              <DetailRow
                label="Resolver Count"
                value={
                  <span className="flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-gray-400" />
                    {payload.resolverCount}
                  </span>
                }
              />
            )}
            {payload.depthReached !== undefined && (
              <DetailRow
                label="Query Depth"
                value={
                  <span className={payload.depthReached > 5 ? 'text-amber-600 dark:text-amber-400' : ''}>
                    {payload.depthReached}
                  </span>
                }
              />
            )}
            {payload.ip && (
              <DetailRow
                label="IP Address"
                value={<code className="font-mono text-sm">{payload.ip}</code>}
              />
            )}
            {tags.length > 0 && (
              <DetailRow
                label="Tags"
                value={<BadgeList items={tags} listType="graphql" maxItems={99} />}
              />
            )}
          </dl>
        </div>
      </div>

      {/* Timing Breakdown */}
      {(payload.parsingDuration || payload.validationDuration || payload.executionDuration) && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-400" />
              Timing Breakdown
            </h2>
          </div>
          <div className="p-4">
            <TimingBreakdown
              parsing={payload.parsingDuration}
              validation={payload.validationDuration}
              execution={payload.executionDuration}
              total={payload.duration}
            />
          </div>
        </div>
      )}

      {/* Subscription Info */}
      {payload.operationType === 'subscription' && payload.subscriptionId && (
        <div className="card">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Zap className="h-5 w-5 text-green-500" />
              Subscription Details
            </h2>
          </div>
          <div className="p-4">
            <dl className="divide-y-0">
              <DetailRow label="Subscription ID" value={<code className="font-mono text-sm">{payload.subscriptionId}</code>} />
              {payload.subscriptionEvent && (
                <DetailRow label="Event" value={<span className="capitalize">{payload.subscriptionEvent}</span>} />
              )}
              {payload.messageCount !== undefined && (
                <DetailRow label="Messages Sent" value={payload.messageCount} />
              )}
              {payload.subscriptionDuration !== undefined && (
                <DetailRow label="Total Duration" value={formatDuration(payload.subscriptionDuration)} />
              )}
            </dl>
          </div>
        </div>
      )}

      {/* Authenticated User */}
      {payload.user && <UserCard user={payload.user} />}

      {/* N+1 Warnings */}
      <N1WarningsSection warnings={payload.potentialN1} />

      {/* Tabs: Query, Variables, Response, Errors, Resolvers */}
      <Tabs
        tabs={tabs}
        defaultTab="query"
        headerRight={getToolbar()}
        onTabChange={setActiveTab}
      />
    </div>
  );
}
