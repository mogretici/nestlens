import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Layers } from 'lucide-react';
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
import { BatchEntry, isBatchEntry } from '../types';

export default function BatchesPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('batches');

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
  } = usePaginatedEntries<BatchEntry>({ type: 'batch', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is BatchEntry => isBatchEntry(entry));

  // Table columns definition
  const tableColumns: Column<BatchEntry>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Name',
      minWidth: '200px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="250px">
          {entry.payload.name}
        </TextCell>
      ),
    },
    {
      key: 'operation',
      header: 'Operation',
      width: '150px',
      render: (entry) => entry.payload.operation ? (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('operations', entry.payload.operation!); }}
        >
          {entry.payload.operation}
        </ClickableBadge>
      ) : (
        <TextCell secondary>-</TextCell>
      ),
    },
    {
      key: 'progress',
      header: 'Progress',
      width: '150px',
      render: (entry) => {
        const { processedItems, totalItems } = entry.payload;
        const percentage = totalItems > 0 ? Math.round((processedItems / totalItems) * 100) : 0;
        return (
          <div className="flex items-center space-x-2">
            <TextCell>{`${processedItems}/${totalItems}`}</TextCell>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({percentage}%)
            </span>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('statuses', entry.payload.status); }}
        >
          {entry.payload.status.toUpperCase()}
        </ClickableBadge>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '100px',
      align: 'right',
      render: (entry) => entry.payload.duration ? (
        <DurationCell ms={entry.payload.duration} />
      ) : (
        <TextCell secondary>-</TextCell>
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
        title="Batches"
        icon={Layers}
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
          onRowClick={(entry) => navigate(`/batches/${entry.id}`)}
          emptyMessage="No batch operations recorded yet"
          emptyIcon={<Layers className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
