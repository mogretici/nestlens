import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Shield } from 'lucide-react';
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
import { GateEntry, isGateEntry } from '../types';

export default function GatesPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('gates');

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
  } = usePaginatedEntries<GateEntry>({ type: 'gate', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is GateEntry => isGateEntry(entry));

  // Table columns definition
  const tableColumns: Column<GateEntry>[] = useMemo(() => [
    {
      key: 'gate',
      header: 'Gate',
      minWidth: '200px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('names', entry.payload.gate); }}
        >
          {entry.payload.gate}
        </ClickableBadge>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '150px',
      render: (entry) => entry.payload.action ? (
        <TextCell truncate maxWidth="150px">
          {entry.payload.action}
        </TextCell>
      ) : (
        <TextCell secondary>-</TextCell>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      minWidth: '150px',
      render: (entry) => entry.payload.subject ? (
        <TextCell mono truncate maxWidth="200px">
          {typeof entry.payload.subject === 'string'
            ? entry.payload.subject
            : JSON.stringify(entry.payload.subject)}
        </TextCell>
      ) : (
        <TextCell secondary>-</TextCell>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      width: '100px',
      render: (entry) => {
        // Filter value must be lowercase to match backend expectations
        const filterValue = entry.payload.allowed ? 'allowed' : 'denied';
        return (
          <ClickableBadge
            onClick={(e) => { e.stopPropagation(); addFilter('results', filterValue); }}
          >
            {filterValue.toUpperCase()}
          </ClickableBadge>
        );
      },
    },
    {
      key: 'user',
      header: 'User',
      width: '150px',
      render: (entry) => entry.payload.userId ? (
        <TextCell truncate maxWidth="150px">
          {entry.payload.userId}
        </TextCell>
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
        title="Gates"
        icon={Shield}
        iconColor="text-amber-600 dark:text-amber-400"
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
          onRowClick={(entry) => navigate(`/gates/${entry.id}`)}
          rowClassName={(entry) => isHighlighted(entry.id) ? 'highlight-new' : ''}
          emptyMessage="No gate checks recorded yet"
          emptyIcon={<Shield className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
