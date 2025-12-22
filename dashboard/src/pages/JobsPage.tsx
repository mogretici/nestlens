import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Briefcase } from 'lucide-react';
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
  JobStatusBadge,
  DurationCell,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { JobEntry, isJobEntry } from '../types';

export default function JobsPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('jobs');

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
  } = usePaginatedEntries<JobEntry>({ type: 'job', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is JobEntry => isJobEntry(entry));

  // Table columns definition
  const tableColumns: Column<JobEntry>[] = useMemo(() => [
    {
      key: 'job',
      header: 'Job',
      minWidth: '200px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('names', entry.payload.name); }}
          className="font-mono"
        >
          {entry.payload.name}
        </ClickableBadge>
      ),
    },
    {
      key: 'queue',
      header: 'Queue',
      width: '120px',
      render: (entry) => (
        <ClickableBadge onClick={(e) => { e.stopPropagation(); addFilter('queues', entry.payload.queue); }}>
          {entry.payload.queue}
        </ClickableBadge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (entry) => (
        <JobStatusBadge
          status={entry.payload.status}
          onClick={(e) => { e.stopPropagation(); addFilter('statuses', entry.payload.status); }}
        />
      ),
    },
    {
      key: 'attempts',
      header: 'Attempts',
      width: '80px',
      align: 'center',
      render: (entry) => (
        <TextCell secondary>{entry.payload.attempts}</TextCell>
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
  ], [addFilter]);

  // Only show full-page spinner on initial load when no data exists
  // This prevents flicker when filters change
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
        title="Jobs"
        icon={Briefcase}
        iconColor="text-yellow-600 dark:text-yellow-400"
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
          onRowClick={(entry) => navigate(`/jobs/${entry.id}`)}
          emptyMessage="No jobs recorded yet"
          emptyIcon={<Briefcase className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
