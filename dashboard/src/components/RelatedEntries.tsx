import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import {
  Entry,
  QueryEntry,
  ExceptionEntry,
  LogEntry,
  CacheEntry,
  EventEntry,
  JobEntry,
  MailEntry,
  isQueryEntry,
  isExceptionEntry,
  isLogEntry,
  isCacheEntry,
  isEventEntry,
  isJobEntry,
  isMailEntry,
} from '../types';
import ClickableBadge from './ClickableBadge';

interface RelatedEntriesProps {
  entries: Entry[];
}

type TabType = 'exceptions' | 'logs' | 'queries' | 'events' | 'jobs' | 'cache' | 'mail';

interface TabConfig {
  id: TabType;
  label: string;
  entries: Entry[];
  color: string;
}

function formatDuration(ms: number): string {
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${ms.toFixed(2)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}


export default function RelatedEntries({ entries }: RelatedEntriesProps) {
  // Group entries by type
  const grouped = useMemo(() => {
    const exceptions = entries.filter((e): e is ExceptionEntry => isExceptionEntry(e));
    const logs = entries.filter((e): e is LogEntry => isLogEntry(e));
    const queries = entries.filter((e): e is QueryEntry => isQueryEntry(e));
    const events = entries.filter((e): e is EventEntry => isEventEntry(e));
    const jobs = entries.filter((e): e is JobEntry => isJobEntry(e));
    const cache = entries.filter((e): e is CacheEntry => isCacheEntry(e));
    const mail = entries.filter((e): e is MailEntry => isMailEntry(e));

    return { exceptions, logs, queries, events, jobs, cache, mail };
  }, [entries]);

  // Build tabs config (only show tabs with entries)
  const tabs: TabConfig[] = useMemo(() => {
    const allTabs: TabConfig[] = [
      { id: 'exceptions', label: 'Exceptions', entries: grouped.exceptions, color: 'bg-red-500' },
      { id: 'logs', label: 'Logs', entries: grouped.logs, color: 'bg-blue-500' },
      { id: 'queries', label: 'Queries', entries: grouped.queries, color: 'bg-purple-500' },
      { id: 'events', label: 'Events', entries: grouped.events, color: 'bg-green-500' },
      { id: 'jobs', label: 'Jobs', entries: grouped.jobs, color: 'bg-yellow-500' },
      { id: 'cache', label: 'Cache', entries: grouped.cache, color: 'bg-cyan-500' },
      { id: 'mail', label: 'Mail', entries: grouped.mail, color: 'bg-pink-500' },
    ];

    return allTabs.filter((tab) => tab.entries.length > 0);
  }, [grouped]);

  // Find first non-empty tab
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (grouped.exceptions.length > 0) return 'exceptions';
    if (grouped.logs.length > 0) return 'logs';
    if (grouped.queries.length > 0) return 'queries';
    if (grouped.events.length > 0) return 'events';
    if (grouped.jobs.length > 0) return 'jobs';
    if (grouped.cache.length > 0) return 'cache';
    if (grouped.mail.length > 0) return 'mail';
    return 'queries';
  });

  // If no entries, don't render
  if (tabs.length === 0) {
    return null;
  }

  // Calculate query stats
  const queryStats = useMemo(() => {
    if (grouped.queries.length === 0) return null;
    const total = grouped.queries.reduce((sum, q) => sum + q.payload.duration, 0);
    const uniqueQueries = new Set(grouped.queries.map((q) => q.payload.query)).size;
    const duplicates = grouped.queries.length - uniqueQueries;
    return { total, duplicates };
  }, [grouped.queries]);

  return (
    <div className="card overflow-hidden">
      {/* Tab Headers */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {tab.label}
            <span
              className={`inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded ${
                activeTab === tab.id
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
              }`}
            >
              {tab.entries.length}
            </span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {/* Queries Tab */}
        {activeTab === 'queries' && grouped.queries.length > 0 && (
          <div>
            {queryStats && (
              <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800/50 text-sm text-gray-600 dark:text-gray-400 flex justify-between">
                <span>
                  {grouped.queries.length} queries, {queryStats.duplicates} of which are duplicated
                </span>
                <span>Total: <strong>{formatDuration(queryStats.total)}</strong></span>
              </div>
            )}
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {grouped.queries.map((query) => (
                <Link
                  key={query.id}
                  to={`/queries/${query.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                >
                  <code className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate flex-1 mr-4">
                    {truncate(query.payload.query, 70)}
                  </code>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {query.payload.slow && (
                      <ClickableBadge listType="queries">SLOW</ClickableBadge>
                    )}
                    <span className={`text-sm font-mono ${query.payload.slow ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500 dark:text-gray-400'}`}>
                      {formatDuration(query.payload.duration)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Exceptions Tab */}
        {activeTab === 'exceptions' && grouped.exceptions.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grouped.exceptions.map((exception) => (
              <Link
                key={exception.id}
                to={`/exceptions/${exception.id}`}
                className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <ClickableBadge listType="exceptions" filterType="names" filterValue={exception.payload.name}>
                        {exception.payload.name}
                      </ClickableBadge>
                      <span className="text-sm text-gray-600 dark:text-gray-400 truncate">
                        {truncate(exception.payload.message, 60)}
                      </span>
                    </div>
                    {exception.payload.context && (
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        at {exception.payload.context}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {formatDistanceToNow(parseDate(exception.createdAt), { addSuffix: true })}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && grouped.logs.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grouped.logs.map((log) => (
              <Link
                key={log.id}
                to={`/logs/${log.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                  <ClickableBadge listType="logs" filterType="levels" filterValue={log.payload.level}>
                    {log.payload.level.toUpperCase()}
                  </ClickableBadge>
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {truncate(log.payload.message, 60)}
                  </span>
                  {log.payload.context && (
                    <ClickableBadge listType="logs" filterType="contexts" filterValue={log.payload.context} className="text-xs">
                      {log.payload.context}
                    </ClickableBadge>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(parseDate(log.createdAt), { addSuffix: true })}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && grouped.events.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grouped.events.map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                  <ClickableBadge listType="events">{event.payload.name}</ClickableBadge>
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    {event.payload.listeners.length} listener(s)
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {formatDuration(event.payload.duration)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Jobs Tab */}
        {activeTab === 'jobs' && grouped.jobs.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grouped.jobs.map((job) => (
              <Link
                key={job.id}
                to={`/jobs/${job.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                  <ClickableBadge listType="jobs" filterType="statuses" filterValue={job.payload.status}>
                    {job.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {job.payload.name}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    on {job.payload.queue}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {job.payload.duration !== undefined && (
                    <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                      {formatDuration(job.payload.duration)}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Cache Tab */}
        {activeTab === 'cache' && grouped.cache.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grouped.cache.map((cache) => (
              <Link
                key={cache.id}
                to={`/cache/${cache.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                  <ClickableBadge listType="cache" filterType="operations" filterValue={cache.payload.operation}>
                    {cache.payload.operation.toUpperCase()}
                  </ClickableBadge>
                  <code className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                    {truncate(cache.payload.key, 50)}
                  </code>
                  {cache.payload.hit !== undefined && (
                    <ClickableBadge listType="cache" clickable={false}>
                      {cache.payload.hit ? 'HIT' : 'MISS'}
                    </ClickableBadge>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {formatDuration(cache.payload.duration)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Mail Tab */}
        {activeTab === 'mail' && grouped.mail.length > 0 && (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {grouped.mail.map((mailEntry) => (
              <Link
                key={mailEntry.id}
                to={`/mail/${mailEntry.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                  <ClickableBadge listType="mail" filterType="statuses" filterValue={mailEntry.payload.status}>
                    {mailEntry.payload.status.toUpperCase()}
                  </ClickableBadge>
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                    {mailEntry.payload.subject}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-500">
                    to {Array.isArray(mailEntry.payload.to) ? mailEntry.payload.to.join(', ') : mailEntry.payload.to}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {formatDuration(mailEntry.payload.duration)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
