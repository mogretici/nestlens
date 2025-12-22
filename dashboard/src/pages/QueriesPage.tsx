import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Database, Zap } from 'lucide-react';
import { usePaginatedEntries } from '../hooks/usePaginatedEntries';
import { useEntryFilters } from '../hooks/useEntryFilters';
import {
  NewEntriesButton,
  LoadMoreButton,
} from '../components/PaginationControls';
import PageHeader, { ToggleSwitch } from '../components/PageHeader';
import DataTable, {
  Column,
  TextCell,
  SourceBadge,
  DurationCell,
  TagsList,
} from '../components/DataTable';
import { QueryEntry, isQueryEntry } from '../types';

export default function QueriesPage() {
  const navigate = useNavigate();
  const [showSlowOnly, setShowSlowOnly] = useState(false);

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    addFilter,
    clearAll,
    serverFilters: baseServerFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('queries');

  // Add slow filter
  const serverFilters = {
    ...baseServerFilters,
    slow: showSlowOnly ? true : undefined,
  };

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
  } = usePaginatedEntries<QueryEntry>({ type: 'query', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is QueryEntry => isQueryEntry(entry));

  // Table columns definition
  const tableColumns: Column<QueryEntry>[] = useMemo(() => [
    {
      key: 'source',
      header: 'Source',
      width: '120px',
      render: (entry) => (
        <SourceBadge
          source={entry.payload.source || 'unknown'}
          onClick={(e) => { e.stopPropagation(); addFilter('sources', entry.payload.source || 'unknown'); }}
        />
      ),
    },
    {
      key: 'query',
      header: 'Query',
      minWidth: '300px',
      render: (entry) => (
        <div className="flex items-start space-x-2">
          {entry.payload.slow && (
            <Zap className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          )}
          <TextCell mono truncate maxWidth="400px">
            {entry.payload.query.length > 100
              ? entry.payload.query.substring(0, 100) + '...'
              : entry.payload.query}
          </TextCell>
        </div>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '100px',
      align: 'right',
      render: (entry) => (
        <DurationCell
          ms={entry.payload.duration || 0}
          slowThreshold={entry.payload.slow ? 0 : 1000}
        />
      ),
    },
    {
      key: 'tags',
      header: 'Tags',
      minWidth: '150px',
      render: (entry) => {
        const source = (entry.payload.source || 'unknown').toLowerCase();
        const filteredTags = (entry.tags || []).filter((tag) => tag.toLowerCase() !== source);
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
        title="Queries"
        icon={Database}
        iconColor="text-purple-600 dark:text-purple-400"
        count={entries.length}
        totalCount={meta?.total}
        refreshing={refreshing}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshToggle={setAutoRefresh}
        filters={headerFilters}
        onClearAllFilters={clearAll}
        actions={
          <ToggleSwitch
            label="Slow Only"
            enabled={showSlowOnly}
            onChange={setShowSlowOnly}
            icon={Zap}
          />
        }
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
          onRowClick={(entry) => navigate(`/queries/${entry.id}`)}
          emptyMessage="No queries recorded yet"
          emptyIcon={<Database className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
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
