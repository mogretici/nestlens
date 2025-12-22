import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Mail } from 'lucide-react';
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
  MailStatusBadge,
  DurationCell,
  TagsList,
} from '../components/DataTable';
import { MailEntry, isMailEntry } from '../types';

// Mail statuses for filtering tags
const mailStatuses = ['sent', 'failed', 'pending', 'queued', 'error'];

export default function MailPage() {
  const navigate = useNavigate();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('mail');

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
  } = usePaginatedEntries<MailEntry>({ type: 'mail', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is MailEntry => isMailEntry(entry));

  // Format recipients
  const formatRecipients = (to: string | string[]) => {
    const recipients = Array.isArray(to) ? to : [to];
    if (recipients.length === 1) return recipients[0];
    return `${recipients[0]} +${recipients.length - 1}`;
  };

  // Table columns definition
  const tableColumns: Column<MailEntry>[] = useMemo(() => [
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      render: (entry) => (
        <MailStatusBadge
          status={entry.payload.status}
          onClick={(e) => { e.stopPropagation(); addFilter('statuses', entry.payload.status); }}
        />
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      minWidth: '250px',
      render: (entry) => (
        <TextCell truncate maxWidth="350px">
          {entry.payload.subject.length > 60
            ? entry.payload.subject.substring(0, 60) + '...'
            : entry.payload.subject}
        </TextCell>
      ),
    },
    {
      key: 'to',
      header: 'To',
      width: '200px',
      render: (entry) => (
        <TextCell mono secondary truncate maxWidth="180px">
          {formatRecipients(entry.payload.to)}
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
      key: 'tags',
      header: 'Tags',
      minWidth: '150px',
      render: (entry) => {
        const filteredTags = (entry.tags || []).filter(tag => !mailStatuses.includes(tag.toLowerCase()));
        return (
          <TagsList
            tags={filteredTags}
            max={3}
            onTagClick={(tag, e) => { e.stopPropagation(); addFilter('tags', tag); }}
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
  ], [addFilter, formatRecipients]);

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
        title="Mail"
        icon={Mail}
        iconColor="text-pink-600 dark:text-pink-400"
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
          onRowClick={(entry) => navigate(`/mail/${entry.id}`)}
          emptyMessage="No emails recorded yet"
          emptyIcon={<Mail className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
