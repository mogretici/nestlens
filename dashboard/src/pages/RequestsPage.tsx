import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Activity, Globe } from 'lucide-react';
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
  TagsList,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { RequestEntry, isRequestEntry } from '../types';

// HTTP methods for tag filtering
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'GRAPHQL'];

// Get display method - GRAPHQL for GraphQL endpoints, otherwise HTTP method
const getDisplayMethod = (entry: RequestEntry): string => {
  if (entry.payload.path?.toLowerCase().includes('/graphql')) {
    return 'GRAPHQL';
  }
  return entry.payload.method.toUpperCase();
};

export default function RequestsPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('requests');

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
  } = usePaginatedEntries<RequestEntry>({ type: 'request', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is RequestEntry => isRequestEntry(entry));

  // Table columns definition
  const tableColumns: Column<RequestEntry>[] = useMemo(() => [
    {
      key: 'method',
      header: 'Method',
      width: '100px',
      render: (entry) => (
        <ClickableBadge listType="requests" filterType="methods">
          {getDisplayMethod(entry)}
        </ClickableBadge>
      ),
    },
    {
      key: 'path',
      header: 'Path',
      minWidth: '200px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="400px">
          {entry.payload.path}
        </TextCell>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      align: 'center',
      render: (entry) => (
        <ClickableBadge listType="requests" filterType="statuses">
          {entry.payload.statusCode || 0}
        </ClickableBadge>
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
      key: 'tags',
      header: 'Tags',
      minWidth: '150px',
      render: (entry) => (
        <TagsList
          tags={(entry.tags || []).filter(t => !httpMethods.includes(t.toUpperCase()))}
          max={3}
          onTagClick={(tag, e) => { e.stopPropagation(); addFilter('tags', tag); }}
        />
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
        title="Requests"
        icon={Activity}
        iconColor="text-blue-600 dark:text-blue-400"
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
          onRowClick={(entry) => navigate(`/requests/${entry.id}`)}
          emptyMessage="No requests recorded yet"
          emptyIcon={<Globe className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
          rowClassName={(entry) => isHighlighted(entry.id) ? 'highlight-new' : ''}
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
