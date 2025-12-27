import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Globe } from 'lucide-react';
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
  DurationCell,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { HttpClientEntry, isHttpClientEntry } from '../types';

export default function HttpClientPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('http-client');

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
  } = usePaginatedEntries<HttpClientEntry>({ type: 'http-client', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is HttpClientEntry => isHttpClientEntry(entry));

  // Table columns definition
  const tableColumns: Column<HttpClientEntry>[] = useMemo(() => [
    {
      key: 'method',
      header: 'Method',
      width: '90px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('methods', entry.payload.method); }}
          className="font-mono"
        >
          {entry.payload.method}
        </ClickableBadge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => {
            e.stopPropagation();
            // Filter by status code or ERR for entries without status
            const statusValue = entry.payload.statusCode ? String(entry.payload.statusCode) : 'ERR';
            addFilter('statuses', statusValue);
          }}
        >
          {entry.payload.statusCode || 'ERR'}
        </ClickableBadge>
      ),
    },
    {
      key: 'hostname',
      header: 'Host',
      width: '180px',
      render: (entry) => entry.payload.hostname ? (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('hostnames', entry.payload.hostname!); }}
          className="font-mono"
        >
          {entry.payload.hostname}
        </ClickableBadge>
      ) : (
        <TextCell secondary>-</TextCell>
      ),
    },
    {
      key: 'path',
      header: 'Path',
      minWidth: '200px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="300px">
          {entry.payload.path || entry.payload.url}
        </TextCell>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '100px',
      align: 'right',
      render: (entry) => (
        <DurationCell ms={entry.payload.duration || 0} />
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
  ], [addFilter]);

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
        title="HTTP Client"
        icon={Globe}
        iconColor="text-cyan-600 dark:text-cyan-400"
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
          onRowClick={(entry) => navigate(`/http-client/${entry.id}`)}
          rowClassName={(entry) => isHighlighted(entry.id) ? 'highlight-new' : ''}
          emptyMessage="No outgoing HTTP requests recorded yet"
          emptyIcon={<Globe className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
