import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Eye } from 'lucide-react';
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
import { ViewEntry, isViewEntry } from '../types';

export default function ViewsPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('views');

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
  } = usePaginatedEntries<ViewEntry>({ type: 'view', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is ViewEntry => isViewEntry(entry));

  // Table columns definition
  const tableColumns: Column<ViewEntry>[] = useMemo(() => [
    {
      key: 'template',
      header: 'Template',
      minWidth: '250px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="350px">
          {entry.payload.template}
        </TextCell>
      ),
    },
    {
      key: 'format',
      header: 'Format',
      width: '100px',
      render: (entry) => entry.payload.format ? (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('formats', entry.payload.format!); }}
          className="font-mono"
        >
          {entry.payload.format}
        </ClickableBadge>
      ) : (
        <TextCell secondary>-</TextCell>
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
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('statuses', entry.payload.status); }}
        >
          {entry.payload.status.toUpperCase()}
        </ClickableBadge>
      ),
    },
    {
      key: 'cache',
      header: 'Cache',
      width: '80px',
      align: 'center',
      render: (entry) => entry.payload.cacheHit !== undefined ? (
        <TextCell>{entry.payload.cacheHit ? 'Yes' : 'No'}</TextCell>
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
        title="Views"
        icon={Eye}
        iconColor="text-teal-600 dark:text-teal-400"
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
          onRowClick={(entry) => navigate(`/views/${entry.id}`)}
          emptyMessage="No view renders recorded yet"
          emptyIcon={<Eye className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
