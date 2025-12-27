import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { ArrowLeft } from 'lucide-react';
import { getEntry } from '../api';
import {
  Entry,
  JsonValue,
  isRequestEntry,
  isQueryEntry,
  isExceptionEntry,
  isLogEntry,
  isEventEntry,
  isJobEntry,
  isCacheEntry,
  isMailEntry,
  isScheduleEntry,
  isHttpClientEntry,
  isRedisEntry,
  isModelEntry,
  isNotificationEntry,
  isViewEntry,
  isCommandEntry,
  isGateEntry,
  isBatchEntry,
  isDumpEntry,
  isGraphQLEntry,
} from '../types';
import RequestDetailView from '../components/RequestDetailView';
import QueryDetailView from '../components/QueryDetailView';
import ExceptionDetailView from '../components/ExceptionDetailView';
import LogDetailView from '../components/LogDetailView';
import EventDetailView from '../components/EventDetailView';
import JobDetailView from '../components/JobDetailView';
import CacheDetailView from '../components/CacheDetailView';
import MailDetailView from '../components/MailDetailView';
import ScheduleDetailView from '../components/ScheduleDetailView';
import HttpClientDetailView from '../components/HttpClientDetailView';
import RedisDetailView from '../components/RedisDetailView';
import ModelDetailView from '../components/ModelDetailView';
import NotificationDetailView from '../components/NotificationDetailView';
import ViewDetailView from '../components/ViewDetailView';
import CommandDetailView from '../components/CommandDetailView';
import GateDetailView from '../components/GateDetailView';
import BatchDetailView from '../components/BatchDetailView';
import DumpDetailView from '../components/DumpDetailView';
import GraphQLDetailView from '../components/GraphQLDetailView';
import Tabs from '../components/Tabs';
import { useJsonToolbar, ControlledInlineJson } from '../components/JsonViewerWithToolbar';
import ClickableBadge from '../components/ClickableBadge';

// Get display method - GRAPHQL for GraphQL endpoints, otherwise HTTP method
function getDisplayMethod(path: string, method: string): string {
  if (path?.toLowerCase().includes('/graphql')) {
    return 'GRAPHQL';
  }
  return method.toUpperCase();
}

// Get query type from SQL query
function getQueryType(query: string): string {
  const trimmed = query.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  if (trimmed.startsWith('ALTER')) return 'ALTER';
  if (trimmed.startsWith('DROP')) return 'DROP';
  if (trimmed.startsWith('TRUNCATE')) return 'TRUNCATE';
  if (trimmed.startsWith('BEGIN') || trimmed.startsWith('START')) return 'TRANSACTION';
  if (trimmed.startsWith('COMMIT')) return 'COMMIT';
  if (trimmed.startsWith('ROLLBACK')) return 'ROLLBACK';
  return 'QUERY';
}

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [entry, setEntry] = useState<Entry | null>(null);
  const [related, setRelated] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const fallbackToolbar = useJsonToolbar();

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const response = await getEntry(parseInt(id));
        setEntry(response.data);
        setRelated(response.related || []);
      } catch (error) {
        console.error('Failed to fetch entry:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading...">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Entry not found
        </h2>
        <Link to="/" className="text-primary-600 hover:text-primary-700 mt-4 inline-block">
          Go back to dashboard
        </Link>
      </div>
    );
  }

  // Render type-specific detail view
  const renderDetailView = () => {
    if (isRequestEntry(entry)) {
      return <RequestDetailView entry={entry} related={related} />;
    }
    if (isQueryEntry(entry)) {
      return <QueryDetailView entry={entry} />;
    }
    if (isExceptionEntry(entry)) {
      return <ExceptionDetailView entry={entry} />;
    }
    if (isLogEntry(entry)) {
      return <LogDetailView entry={entry} />;
    }
    if (isEventEntry(entry)) {
      return <EventDetailView entry={entry} />;
    }
    if (isJobEntry(entry)) {
      return <JobDetailView entry={entry} />;
    }
    if (isCacheEntry(entry)) {
      return <CacheDetailView entry={entry} />;
    }
    if (isMailEntry(entry)) {
      return <MailDetailView entry={entry} />;
    }
    if (isScheduleEntry(entry)) {
      return <ScheduleDetailView entry={entry} />;
    }
    if (isHttpClientEntry(entry)) {
      return <HttpClientDetailView entry={entry} />;
    }
    if (isRedisEntry(entry)) {
      return <RedisDetailView entry={entry} />;
    }
    if (isModelEntry(entry)) {
      return <ModelDetailView entry={entry} />;
    }
    if (isNotificationEntry(entry)) {
      return <NotificationDetailView entry={entry} />;
    }
    if (isViewEntry(entry)) {
      return <ViewDetailView entry={entry} />;
    }
    if (isCommandEntry(entry)) {
      return <CommandDetailView entry={entry} />;
    }
    if (isGateEntry(entry)) {
      return <GateDetailView entry={entry} />;
    }
    if (isBatchEntry(entry)) {
      return <BatchDetailView entry={entry} />;
    }
    if (isDumpEntry(entry)) {
      return <DumpDetailView entry={entry} />;
    }
    if (isGraphQLEntry(entry)) {
      return <GraphQLDetailView entry={entry} />;
    }
    // Generic fallback for future entry types
    const unknownEntry = entry as Entry;
    const payloadData = unknownEntry.payload as unknown as JsonValue;
    const fallbackTabs = [
      {
        id: 'payload',
        label: 'Payload',
        content: (
          <ControlledInlineJson
            data={payloadData}
            toolbarState={fallbackToolbar.state}
            searchBar={fallbackToolbar.SearchBar}
            maxHeight={400}
          />
        ),
      },
    ];
    return (
      <Tabs
        tabs={fallbackTabs}
        defaultTab="payload"
        headerRight={<fallbackToolbar.Toolbar data={payloadData} />}
      />
    );
  };

  return (
    <div>
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 lg:left-64 z-30 h-16 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-4 px-4 lg:px-6 h-full">
          <Link
            to={-1 as unknown as string}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3">
              {/* Request entries: show method badge + path */}
              {isRequestEntry(entry) ? (
                <>
                  <ClickableBadge listType="requests">
                    {getDisplayMethod(entry.payload.path, entry.payload.method)}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.path}
                  </h1>
                </>
              ) : isQueryEntry(entry) ? (
                <>
                  <ClickableBadge listType="queries" filterType="types">
                    {getQueryType(entry.payload.query)}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.query.length > 100
                      ? entry.payload.query.substring(0, 100) + '...'
                      : entry.payload.query}
                  </h1>
                </>
              ) : isExceptionEntry(entry) ? (
                (() => {
                  const exceptionName = entry.payload.name && entry.payload.name.toLowerCase() !== 'error'
                    ? entry.payload.name
                    : entry.payload.code
                      ? String(entry.payload.code)
                      : 'Exception';
                  return (
                    <>
                      <ClickableBadge listType="exceptions" filterType="names">
                        {exceptionName}
                      </ClickableBadge>
                      <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                        {entry.payload.request?.url || entry.payload.message}
                      </h1>
                    </>
                  );
                })()
              ) : isLogEntry(entry) ? (
                <>
                  <ClickableBadge listType="logs" filterType="levels">
                    {entry.payload.level.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.message.length > 100
                      ? entry.payload.message.substring(0, 100) + '...'
                      : entry.payload.message}
                  </h1>
                </>
              ) : isEventEntry(entry) ? (
                <>
                  <ClickableBadge listType="events" filterType="names">
                    {entry.payload.name}
                  </ClickableBadge>
                  <h1 className="text-sm text-gray-600 dark:text-gray-300">
                    {entry.payload.listeners.length} listener{entry.payload.listeners.length !== 1 ? 's' : ''} &middot; {entry.payload.duration}ms
                  </h1>
                </>
              ) : isJobEntry(entry) ? (
                <>
                  <ClickableBadge listType="jobs" filterType="statuses" filterValue={entry.payload.status}>
                    {entry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.name}
                  </h1>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {entry.payload.queue} &middot; {entry.payload.duration ? `${entry.payload.duration}ms` : '-'}
                  </span>
                </>
              ) : isCacheEntry(entry) ? (
                <>
                  <ClickableBadge listType="cache" filterType="operations" filterValue={entry.payload.operation}>
                    {entry.payload.operation.toUpperCase()}
                  </ClickableBadge>
                  {entry.payload.operation === 'get' && (
                    <ClickableBadge listType="cache">
                      {entry.payload.hit ? 'HIT' : 'MISS'}
                    </ClickableBadge>
                  )}
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.key.length > 60 ? entry.payload.key.substring(0, 60) + '...' : entry.payload.key}
                  </h1>
                </>
              ) : isMailEntry(entry) ? (
                <>
                  <ClickableBadge listType="mail" filterType="statuses" filterValue={entry.payload.status}>
                    {entry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm text-gray-900 dark:text-white truncate">
                    {entry.payload.subject.length > 60 ? entry.payload.subject.substring(0, 60) + '...' : entry.payload.subject}
                  </h1>
                </>
              ) : isScheduleEntry(entry) ? (
                <>
                  <ClickableBadge listType="schedule" filterType="statuses" filterValue={entry.payload.status}>
                    {entry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.name}
                  </h1>
                  {entry.payload.cron && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {entry.payload.cron}
                    </span>
                  )}
                </>
              ) : isHttpClientEntry(entry) ? (
                <>
                  <ClickableBadge listType="http-client" filterType="methods" filterValue={entry.payload.method}>
                    {entry.payload.method}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.hostname || entry.payload.url}
                  </h1>
                </>
              ) : isRedisEntry(entry) ? (
                <>
                  <ClickableBadge listType="redis" filterType="commands" filterValue={entry.payload.command}>
                    {entry.payload.command}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.keyPattern || 'Redis Command'}
                  </h1>
                </>
              ) : isModelEntry(entry) ? (
                <>
                  <ClickableBadge listType="models" filterType="actions" filterValue={entry.payload.action}>
                    {entry.payload.action.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.entity}
                  </h1>
                </>
              ) : isNotificationEntry(entry) ? (
                <>
                  <ClickableBadge listType="notifications" filterType="types" filterValue={entry.payload.type}>
                    {entry.payload.type}
                  </ClickableBadge>
                  <h1 className="text-sm text-gray-900 dark:text-white truncate">
                    {entry.payload.title || entry.payload.recipient}
                  </h1>
                </>
              ) : isViewEntry(entry) ? (
                <>
                  <ClickableBadge listType="views" filterType="statuses" filterValue={entry.payload.status}>
                    {entry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.template}
                  </h1>
                </>
              ) : isCommandEntry(entry) ? (
                <>
                  <ClickableBadge listType="commands" filterType="statuses" filterValue={entry.payload.status}>
                    {entry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.name}
                  </h1>
                </>
              ) : isGateEntry(entry) ? (
                <>
                  <ClickableBadge listType="gates" filterType="results" filterValue={entry.payload.allowed ? 'ALLOWED' : 'DENIED'}>
                    {entry.payload.allowed ? 'ALLOWED' : 'DENIED'}
                  </ClickableBadge>
                  <h1 className="text-sm text-gray-900 dark:text-white truncate">
                    {entry.payload.gate}
                  </h1>
                </>
              ) : isBatchEntry(entry) ? (
                <>
                  <ClickableBadge listType="batches" filterType="statuses" filterValue={entry.payload.status}>
                    {entry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.name}
                  </h1>
                </>
              ) : isDumpEntry(entry) ? (
                <>
                  <ClickableBadge listType="dumps" filterType="operations" filterValue={entry.payload.operation}>
                    {entry.payload.operation.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.format}
                  </h1>
                </>
              ) : isGraphQLEntry(entry) ? (
                <>
                  <ClickableBadge listType="graphql" filterType="operationTypes" filterValue={entry.payload.operationType}>
                    {entry.payload.operationType.toUpperCase()}
                  </ClickableBadge>
                  <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                    {entry.payload.operationName || '(anonymous)'}
                  </h1>
                  {entry.payload.hasErrors && (
                    <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                      Error
                    </span>
                  )}
                </>
              ) : (
                (() => {
                  const unknownEntry = entry as Entry;
                  return (
                    <>
                      <ClickableBadge clickable={false}>
                        {unknownEntry.type.toUpperCase()}
                      </ClickableBadge>
                      <h1 className="text-sm font-mono text-gray-900 dark:text-white truncate">
                        {unknownEntry.requestId || `#${unknownEntry.id}`}
                      </h1>
                    </>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content with top padding to account for fixed header */}
      <div className="pt-16 space-y-6">

      {/* Type-specific Detail View */}
      {renderDetailView()}

      {/* Related Entries */}
      {related.length > 0 && (
        <div className="card">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Related Entries ({related.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {related.map((relatedEntry) => (
              <Link
                key={relatedEntry.id}
                to={getEntryRoute(relatedEntry)}
                className="p-4 block hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <ClickableBadge clickable={false}>
                      {relatedEntry.type.toUpperCase()}
                    </ClickableBadge>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      {getEntrySummary(relatedEntry)}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(parseDate(relatedEntry.createdAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// Map entry type to route path
function getEntryRoute(entry: Entry): string {
  const typeRouteMap: Record<string, string> = {
    request: 'requests',
    query: 'queries',
    exception: 'exceptions',
    log: 'logs',
    event: 'events',
    job: 'jobs',
    cache: 'cache',
    mail: 'mail',
    schedule: 'schedule',
    'http-client': 'http-client',
    redis: 'redis',
    model: 'models',
    notification: 'notifications',
    view: 'views',
    command: 'commands',
    gate: 'gates',
    batch: 'batches',
    dump: 'dumps',
    graphql: 'graphql',
  };
  const route = typeRouteMap[entry.type] || 'entries';
  return `/${route}/${entry.id}`;
}

function getEntrySummary(entry: Entry): string {
  if (isQueryEntry(entry)) {
    const query = entry.payload.query;
    return query.length > 50 ? query.substring(0, 50) + '...' : query;
  }
  if (isExceptionEntry(entry)) {
    return `${entry.payload.name}: ${entry.payload.message}`;
  }
  if (isLogEntry(entry)) {
    const message = entry.payload.message;
    return message.length > 50 ? message.substring(0, 50) + '...' : message;
  }
  if (isRequestEntry(entry)) {
    return `${entry.payload.method} ${entry.payload.path}`;
  }
  if (isHttpClientEntry(entry)) {
    return `${entry.payload.method} ${entry.payload.hostname || entry.payload.url}`;
  }
  if (isGraphQLEntry(entry)) {
    return `${entry.payload.operationType} ${entry.payload.operationName || '(anonymous)'}`;
  }
  return `Entry #${entry.id}`;
}
