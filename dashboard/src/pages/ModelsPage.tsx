import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Box } from 'lucide-react';
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
import { ModelEntry, isModelEntry } from '../types';

export default function ModelsPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('models');

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
  } = usePaginatedEntries<ModelEntry>({ type: 'model', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is ModelEntry => isModelEntry(entry));

  // Table columns definition
  const tableColumns: Column<ModelEntry>[] = useMemo(() => [
    {
      key: 'action',
      header: 'Action',
      width: '120px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('actions', entry.payload.action); }}
        >
          {entry.payload.action.toUpperCase()}
        </ClickableBadge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      width: '150px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('entities', entry.payload.entity); }}
          className="font-mono"
        >
          {entry.payload.entity}
        </ClickableBadge>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      width: '150px',
      render: (entry) => entry.payload.source ? (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('sources', entry.payload.source!); }}
          className="font-mono text-xs"
        >
          {entry.payload.source}
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
      key: 'records',
      header: 'Records',
      width: '80px',
      align: 'center',
      render: (entry) => entry.payload.records !== undefined ? (
        <TextCell>{entry.payload.records}</TextCell>
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
        title="Models"
        icon={Box}
        iconColor="text-purple-600 dark:text-purple-400"
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
          onRowClick={(entry) => navigate(`/models/${entry.id}`)}
          emptyMessage="No model events recorded yet"
          emptyIcon={<Box className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
