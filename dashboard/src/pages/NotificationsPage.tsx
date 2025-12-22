import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Bell } from 'lucide-react';
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
import { NotificationEntry, isNotificationEntry } from '../types';

export default function NotificationsPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('notifications');

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
  } = usePaginatedEntries<NotificationEntry>({ type: 'notification', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is NotificationEntry => isNotificationEntry(entry));

  // Table columns definition
  const tableColumns: Column<NotificationEntry>[] = useMemo(() => [
    {
      key: 'type',
      header: 'Type',
      width: '150px',
      render: (entry) => (
        <ClickableBadge
          onClick={(e) => { e.stopPropagation(); addFilter('types', entry.payload.type); }}
        >
          {entry.payload.type}
        </ClickableBadge>
      ),
    },
    {
      key: 'recipient',
      header: 'Recipient',
      minWidth: '200px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="250px">
          {entry.payload.recipient}
        </TextCell>
      ),
    },
    {
      key: 'title',
      header: 'Title',
      minWidth: '200px',
      render: (entry) => entry.payload.title ? (
        <TextCell truncate maxWidth="300px">
          {entry.payload.title}
        </TextCell>
      ) : (
        <TextCell secondary>-</TextCell>
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
        title="Notifications"
        icon={Bell}
        iconColor="text-indigo-600 dark:text-indigo-400"
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
          onRowClick={(entry) => navigate(`/notifications/${entry.id}`)}
          emptyMessage="No notifications recorded yet"
          emptyIcon={<Bell className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
