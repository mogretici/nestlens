import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { AlertTriangle, CheckCircle, Circle, RefreshCw } from 'lucide-react';
import { usePaginatedEntries } from '../hooks/usePaginatedEntries';
import { useEntryFilters } from '../hooks/useEntryFilters';
import {
  NewEntriesButton,
  LoadMoreButton,
} from '../components/PaginationControls';
import PageHeader, { FilterTabs } from '../components/PageHeader';
import DataTable, {
  Column,
  TextCell,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { ExceptionEntry, isExceptionEntry } from '../types';
import { resolveEntry, unresolveEntry } from '../api';
import { useStats } from '../contexts/StatsContext';

type FilterStatus = 'all' | 'unresolved' | 'resolved';

export default function ExceptionsPage() {
  const navigate = useNavigate();
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const { refreshStats } = useStats();

  // Use centralized filter hook - all config comes from entryTypes.ts
  const {
    clearAll,
    serverFilters: baseServerFilters,
    headerFilters,
    hasFilters,
  } = useEntryFilters('exceptions');

  // Add resolved filter to server filters
  const serverFilters = {
    ...baseServerFilters,
    resolved: filterStatus === 'all' ? undefined : filterStatus === 'resolved',
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
    updateEntry,
    meta,
    isHighlighted,
  } = usePaginatedEntries<ExceptionEntry>({ type: 'exception', limit: 50, filters: serverFilters });

  // Type guard filter only (server handles the actual filtering)
  const entries = allEntries.filter((entry): entry is ExceptionEntry => isExceptionEntry(entry));

  // Get display name for exception
  const getDisplayName = (entry: ExceptionEntry) => {
    return entry.payload.name && entry.payload.name.toLowerCase() !== 'error'
      ? entry.payload.name
      : entry.payload.code
        ? String(entry.payload.code)
        : 'Error';
  };

  // Status filter tabs
  const statusTabs = [
    { id: 'all', label: 'All' },
    { id: 'unresolved', label: 'Unresolved' },
    { id: 'resolved', label: 'Resolved' },
  ];

  const handleToggleResolved = async (e: React.MouseEvent, entry: ExceptionEntry) => {
    e.preventDefault();
    e.stopPropagation();

    setResolvingId(entry.id);
    try {
      if (entry.resolvedAt) {
        const result = await unresolveEntry(entry.id);
        updateEntry(result.data);
      } else {
        const result = await resolveEntry(entry.id);
        updateEntry(result.data);
      }
      // Refresh stats to update sidebar badge count
      await refreshStats();
    } catch (error) {
      console.error('Failed to toggle resolution:', error);
    } finally {
      setResolvingId(null);
    }
  };

  // Table columns definition
  const tableColumns: Column<ExceptionEntry>[] = useMemo(() => [
    {
      key: 'exception',
      header: 'Exception',
      minWidth: '180px',
      render: (entry) => {
        const displayName = getDisplayName(entry);
        return (
          <ClickableBadge listType="exceptions" filterType="names">
            {displayName}
          </ClickableBadge>
        );
      },
    },
    {
      key: 'message',
      header: 'Message',
      minWidth: '200px',
      render: (entry) => (
        <TextCell truncate maxWidth="300px">
          {entry.payload.message}
        </TextCell>
      ),
    },
    {
      key: 'method',
      header: 'Method',
      width: '100px',
      render: (entry) => {
        const requestMethod = entry.payload.request?.method || '-';
        return requestMethod !== '-' ? (
          <ClickableBadge listType="exceptions" filterType="methods">
            {requestMethod}
          </ClickableBadge>
        ) : (
          <TextCell secondary>—</TextCell>
        );
      },
    },
    {
      key: 'path',
      header: 'Path',
      minWidth: '150px',
      render: (entry) => {
        const requestPath = entry.payload.request?.url || '-';
        return requestPath !== '-' ? (
          <ClickableBadge listType="exceptions" filterType="paths" className="font-mono">
            {requestPath.length > 40 ? requestPath.substring(0, 40) + '...' : requestPath}
          </ClickableBadge>
        ) : (
          <TextCell secondary>—</TextCell>
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
    {
      key: 'status',
      header: 'Status',
      width: '80px',
      align: 'center',
      render: (entry) => (
        <button
          onClick={(e) => handleToggleResolved(e, entry)}
          disabled={resolvingId === entry.id}
          className={`p-1 transition-colors ${
            entry.resolvedAt
              ? 'text-green-500 hover:text-green-600'
              : 'text-gray-400 hover:text-green-500'
          }`}
          title={entry.resolvedAt ? 'Mark as unresolved' : 'Mark as resolved'}
        >
          {resolvingId === entry.id ? (
            <RefreshCw className="h-5 w-5 animate-spin" />
          ) : entry.resolvedAt ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <Circle className="h-5 w-5" />
          )}
        </button>
      ),
    },
  ], [resolvingId, handleToggleResolved]);

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
  const headerPadding = hasFilters ? 'pt-36' : 'pt-24';

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Exceptions"
        icon={AlertTriangle}
        iconColor="text-red-600 dark:text-red-400"
        count={entries.length}
        totalCount={meta?.total}
        refreshing={refreshing}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshToggle={setAutoRefresh}
        filters={headerFilters}
        onClearAllFilters={clearAll}
        filterControls={
          <FilterTabs
            tabs={statusTabs}
            activeTab={filterStatus}
            onChange={(id) => setFilterStatus(id as FilterStatus)}
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
          onRowClick={(entry) => navigate(`/exceptions/${entry.id}`)}
          emptyMessage="No exceptions recorded yet"
          emptyIcon={<AlertTriangle className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
          rowClassName={(entry) => {
            const classes = [];
            if (entry.resolvedAt) classes.push('opacity-50');
            if (isHighlighted(entry.id)) classes.push('highlight-new');
            return classes.join(' ');
          }}
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
