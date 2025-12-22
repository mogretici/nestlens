import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { HardDrive } from 'lucide-react';
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
  CacheOperationBadge,
  CacheHitBadge,
  DurationCell,
} from '../components/DataTable';
import { CacheEntry, isCacheEntry } from '../types';

export default function CachePage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('cache');

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
  } = usePaginatedEntries<CacheEntry>({ type: 'cache', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is CacheEntry => isCacheEntry(entry));

  // Table columns definition
  const tableColumns: Column<CacheEntry>[] = useMemo(() => [
    {
      key: 'operation',
      header: 'Operation',
      width: '100px',
      render: (entry) => (
        <CacheOperationBadge
          operation={entry.payload.operation}
          onClick={(e) => { e.stopPropagation(); addFilter('operations', entry.payload.operation); }}
        />
      ),
    },
    {
      key: 'key',
      header: 'Key',
      minWidth: '200px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="400px">
          {entry.payload.key.length > 50
            ? entry.payload.key.substring(0, 50) + '...'
            : entry.payload.key}
        </TextCell>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      width: '80px',
      align: 'center',
      render: (entry) => entry.payload.operation === 'get' ? (
        <CacheHitBadge
          hit={entry.payload.hit || false}
          onClick={(e) => { e.stopPropagation(); addFilter('tags', entry.payload.hit ? 'hit' : 'miss'); }}
        />
      ) : (
        <TextCell secondary>—</TextCell>
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
        title="Cache"
        icon={HardDrive}
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
          onRowClick={(entry) => navigate(`/cache/${entry.id}`)}
          emptyMessage="No cache operations recorded yet"
          emptyIcon={<HardDrive className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
