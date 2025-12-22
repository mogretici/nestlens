import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import cronstrue from 'cronstrue';
import { parseDate } from '../utils/date';
import { formatMsHuman } from '../utils/format';
import { Clock } from 'lucide-react';
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
  ScheduleStatusBadge,
  DurationCell,
  TagsList,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { ScheduleEntry, isScheduleEntry } from '../types';

// Schedule statuses for tag filtering
const scheduleStatuses = ['started', 'completed', 'failed'];

// Convert cron expression to human-readable text
function formatCronHuman(cron: string): string | null {
  try {
    return cronstrue.toString(cron);
  } catch {
    return null;
  }
}

export default function SchedulePage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('schedule');

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
  } = usePaginatedEntries<ScheduleEntry>({ type: 'schedule', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is ScheduleEntry => isScheduleEntry(entry));

  // Format schedule info (cron or interval)
  const formatSchedule = (entry: ScheduleEntry) => {
    if (entry.payload.cron) return entry.payload.cron;
    if (entry.payload.interval) return `${entry.payload.interval}ms`;
    return '-';
  };

  // Table columns definition
  const tableColumns: Column<ScheduleEntry>[] = useMemo(() => [
    {
      key: 'task',
      header: 'Task',
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
      key: 'schedule',
      header: 'Schedule',
      minWidth: '150px',
      render: (entry) => (
        <div>
          <TextCell mono>{formatSchedule(entry)}</TextCell>
          {entry.payload.cron && formatCronHuman(entry.payload.cron) && (
            <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
              {formatCronHuman(entry.payload.cron)}
            </span>
          )}
          {entry.payload.interval && formatMsHuman(entry.payload.interval) && (
            <span className="text-xs text-gray-500 dark:text-gray-400 block mt-0.5">
              {formatMsHuman(entry.payload.interval)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      render: (entry) => (
        <ScheduleStatusBadge
          status={entry.payload.status}
          onClick={(e) => { e.stopPropagation(); addFilter('statuses', entry.payload.status); }}
        />
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
      key: 'tags',
      header: 'Tags',
      minWidth: '150px',
      render: (entry) => {
        const filteredTags = (entry.tags || []).filter(tag => !scheduleStatuses.includes(tag.toLowerCase()));
        return (
          <TagsList
            tags={filteredTags}
            max={3}
            onTagClick={(tag: string, e: React.MouseEvent) => { e.stopPropagation(); addFilter('tags', tag); }}
          />
        );
      },
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
  ], [addFilter, formatSchedule]);

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
        title="Schedule"
        icon={Clock}
        iconColor="text-gray-600 dark:text-gray-400"
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
          onRowClick={(entry) => navigate(`/schedule/${entry.id}`)}
          emptyMessage="No scheduled tasks recorded yet"
          emptyIcon={<Clock className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
