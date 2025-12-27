import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import { Hexagon } from 'lucide-react';
import { usePaginatedEntries } from '../hooks/usePaginatedEntries';
import { useEntryFilters, HeaderFilter } from '../hooks/useEntryFilters';
import {
  NewEntriesButton,
  LoadMoreButton,
} from '../components/PaginationControls';
import PageHeader from '../components/PageHeader';
import DataTable, {
  Column,
  TextCell,
  DurationCell,
  GraphQLErrorBadge,
  N1WarningBadge,
} from '../components/DataTable';
import ClickableBadge from '../components/ClickableBadge';
import { GraphQLEntry, isGraphQLEntry } from '../types';

export default function GraphQLPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read boolean filters from URL
  const hasErrorsFilter = searchParams.get('hasErrors') === 'true';
  const hasN1Filter = searchParams.get('hasN1') === 'true';

  // Use centralized filter hook
  const {
    serverFilters: baseServerFilters,
    headerFilters: baseHeaderFilters,
    hasFilters: baseHasFilters,
  } = useEntryFilters('graphql');

  // Add boolean filters to server filters
  const serverFilters = {
    ...baseServerFilters,
    hasErrors: hasErrorsFilter ? true : undefined,
    hasN1: hasN1Filter ? true : undefined,
  };

  // Add boolean filters to header display
  const booleanHeaderFilters: HeaderFilter[] = [];
  if (hasErrorsFilter) {
    booleanHeaderFilters.push({
      category: 'Status',
      value: 'ERROR',
      onRemove: () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('hasErrors');
        setSearchParams(newParams, { replace: true });
      },
    });
  }
  if (hasN1Filter) {
    booleanHeaderFilters.push({
      category: 'Performance',
      value: 'N+1',
      onRemove: () => {
        const newParams = new URLSearchParams(searchParams);
        newParams.delete('hasN1');
        setSearchParams(newParams, { replace: true });
      },
    });
  }

  const headerFilters = [...baseHeaderFilters, ...booleanHeaderFilters];
  const hasFilters = baseHasFilters || hasErrorsFilter || hasN1Filter;

  // Clear all including boolean filters
  const clearAll = () => {
    setSearchParams({}, { replace: true });
  };

  // Handlers for boolean filter badges
  const handleFilterByErrors = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newParams = new URLSearchParams(searchParams);
    newParams.set('hasErrors', 'true');
    setSearchParams(newParams, { replace: true });
  };

  const handleFilterByN1 = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newParams = new URLSearchParams(searchParams);
    newParams.set('hasN1', 'true');
    setSearchParams(newParams, { replace: true });
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
    isHighlighted,
  } = usePaginatedEntries<GraphQLEntry>({ type: 'graphql', limit: 50, filters: serverFilters });

  // Type guard filter
  const entries = allEntries.filter((entry): entry is GraphQLEntry => isGraphQLEntry(entry));

  // Table columns definition
  const tableColumns: Column<GraphQLEntry>[] = useMemo(() => [
    {
      key: 'type',
      header: 'Type',
      width: '110px',
      render: (entry) => (
        <ClickableBadge listType="graphql" filterType="operationTypes">
          {entry.payload.operationType}
        </ClickableBadge>
      ),
    },
    {
      key: 'operation',
      header: 'Operation',
      minWidth: '150px',
      render: (entry) => (
        <TextCell mono truncate maxWidth="280px">
          {entry.payload.operationName || '(anonymous)'}
        </TextCell>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '180px',
      align: 'center',
      render: (entry) => (
        <div className="flex items-center gap-1.5 justify-center">
          <ClickableBadge listType="graphql" filterType="statuses">
            {entry.payload.statusCode}
          </ClickableBadge>
          {entry.payload.hasErrors && (
            <GraphQLErrorBadge onClick={handleFilterByErrors} />
          )}
          {entry.payload.potentialN1 && entry.payload.potentialN1.length > 0 && (
            <N1WarningBadge count={entry.payload.potentialN1.length} onClick={handleFilterByN1} />
          )}
        </div>
      ),
    },
    {
      key: 'resolvers',
      header: 'Resolvers',
      width: '90px',
      align: 'center',
      render: (entry) => (
        <TextCell secondary className="text-xs tabular-nums">
          {entry.payload.resolverCount ?? '-'}
        </TextCell>
      ),
    },
    {
      key: 'duration',
      header: 'Duration',
      width: '100px',
      align: 'right',
      render: (entry) => (
        <DurationCell ms={entry.payload.duration} />
      ),
    },
    {
      key: 'time',
      header: 'Time',
      width: '180px',
      align: 'right',
      render: (entry) => (
        <TextCell secondary className="text-xs whitespace-nowrap">
          {formatDistanceToNow(parseDate(entry.createdAt), { addSuffix: true })}
        </TextCell>
      ),
    },
  ], [handleFilterByErrors, handleFilterByN1]);

  // Loading spinner
  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading...">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const headerPadding = hasFilters ? 'pt-28' : 'pt-16';

  return (
    <div>
      <PageHeader
        title="GraphQL"
        icon={Hexagon}
        iconColor="text-purple-600 dark:text-purple-400"
        count={entries.length}
        totalCount={meta?.total}
        refreshing={refreshing}
        autoRefreshEnabled={autoRefreshEnabled}
        onAutoRefreshToggle={setAutoRefresh}
        filters={headerFilters}
        onClearAllFilters={clearAll}
      />

      <div className={`${headerPadding} space-y-4 transition-all duration-200`}>
        <NewEntriesButton
          count={newEntriesCount}
          onClick={loadNew}
          loading={refreshing}
        />

        <DataTable
          columns={tableColumns}
          data={entries}
          keyExtractor={(entry) => entry.id}
          onRowClick={(entry) => navigate(`/graphql/${entry.id}`)}
          rowClassName={(entry) => isHighlighted(entry.id) ? 'highlight-new' : ''}
          emptyMessage="No GraphQL operations recorded yet"
          emptyIcon={<Hexagon className="h-8 w-8 text-gray-400 dark:text-gray-500" />}
        />

        <LoadMoreButton
          hasMore={hasMore}
          onClick={loadMore}
          loading={refreshing}
        />
      </div>
    </div>
  );
}
