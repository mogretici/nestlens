import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { FileText } from 'lucide-react';
import { usePaginatedEntries } from '../hooks/usePaginatedEntries';
import { useEntryFilters } from '../hooks/useEntryFilters';
import {
  NewEntriesButton,
  LoadMoreButton,
} from '../components/PaginationControls';
import PageHeader from '../components/PageHeader';
import DataTable, {
  Column,
  TextCell,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { LogEntry, isLogEntry } from '../types';

export default function LogsPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('logs');

  const {
    entries: allEntries,
    loading,
    refreshing,
    newEntriesCount,
    hasMore,
    loadMore,
    loadNew,
    autoRefreshEnabled,
    setAutoRefresh,
    meta,
    isHighlighted,
  } = usePaginatedEntries<LogEntry>({ type: 'log', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is LogEntry => isLogEntry(entry));

  // Table columns definition
  const tableColumns: Column<LogEntry>[] = useMemo(() => [
    {
      key: 'level',
      header: 'Level',
      width: '100px',
      render: (entry) => (
        <ClickableBadge listType="logs" filterType="levels">
          {entry.payload.level}
        </ClickableBadge>
      ),
    },
    {
      key: 'message',
      header: 'Message',
      minWidth: '300px',
      render: (entry) => (
        <TextCell truncate maxWidth="500px">
          {entry.payload.message.length > 100
            ? entry.payload.message.substring(0, 100) + '...'
            : entry.payload.message}
        </TextCell>
      ),
    },
    {
      key: 'context',
      header: 'Context',
      width: '150px',
      render: (entry) => entry.payload.context ? (
        <ClickableBadge listType="logs" filterType="contexts" className="font-mono">
          {entry.payload.context}
        </ClickableBadge>
      ) : (
        <TextCell secondary>—</TextCell>
      ),
    },
    {
      key: 'time',
      header: 'Time',
      width: '170px',
      align: 'right',
      render: (entry) => (
        <TextCell secondary className="text-xs">
          {formatDistanceToNow(parseDate(entry.createdAt), { addSuffix: true })}
        </TextCell>
      ),
    },
  ], []);

  // Only show full-page spinner on initial load when no data exists
  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading...">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Calculate dynamic padding based on header height
  const headerPadding = hasFilters ? 'pt-28' : 'pt-16';

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Logs"
        icon={FileText}
        iconColor="text-green-600 dark:text-green-400"
        count={entries.length}
        totalCount={meta?.total}
        refreshing={refreshing}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshToggle={setAutoRefresh}
        filters={headerFilters}
        onClearAllFilters={clearAll}
      />

      {/* Content */}
      <div className={`${headerPadding} space-y-4 transition-all duration-200`}>
        {/* New entries button */}
        <NewEntriesButton
          count={newEntriesCount}
          onClick={loadNew}
          loading={refreshing}
        />

        <DataTable
          columns={tableColumns}
          data={entries}
          keyExtractor={(entry) => entry.id}
          onRowClick={(entry) => navigate(`/logs/${entry.id}`)}
          rowClassName={(entry) => isHighlighted(entry.id) ? 'highlight-new' : ''}
          emptyMessage="No logs recorded yet"
          emptyIcon={<FileText className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
        />

        {/* Load more button */}
        <LoadMoreButton
          hasMore={hasMore}
          onClick={loadMore}
          loading={refreshing}
        />
      </div>
    </div>
  );
}
