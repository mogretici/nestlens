import { ChevronDown, Bell, RefreshCw } from 'lucide-react';

interface PaginationControlsProps {
  newEntriesCount: number;
  hasMore: boolean;
  loading: boolean;
  onLoadNew: () => void;
  onLoadMore: () => void;
  autoRefreshEnabled: boolean;
  onAutoRefreshChange: (enabled: boolean) => void;
}

export function NewEntriesButton({
  count,
  onClick,
  loading,
}: {
  count: number;
  onClick: () => void;
  loading: boolean;
}) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 px-4 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 font-medium rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      <span>
        Load {count} new {count === 1 ? 'entry' : 'entries'}
      </span>
    </button>
  );
}

export function LoadMoreButton({
  hasMore,
  onClick,
  loading,
}: {
  hasMore: boolean;
  onClick: () => void;
  loading: boolean;
}) {
  if (!hasMore) return null;

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 px-4 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center justify-center space-x-2 disabled:opacity-50"
    >
      {loading ? (
        <RefreshCw className="h-4 w-4 animate-spin" />
      ) : (
        <ChevronDown className="h-4 w-4" />
      )}
      <span>Load older entries</span>
    </button>
  );
}

export function RefreshButton({
  autoRefreshEnabled,
  onToggleAutoRefresh,
  refreshing,
}: {
  autoRefreshEnabled: boolean;
  onToggleAutoRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <button
      onClick={onToggleAutoRefresh}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center space-x-2 transition-all ${
        autoRefreshEnabled
          ? 'bg-primary-600 text-white hover:bg-primary-700'
          : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
      }`}
      title={autoRefreshEnabled ? 'Auto-refresh active (click to stop)' : 'Click to enable auto-refresh'}
    >
      <RefreshCw className={`h-4 w-4 ${refreshing && !autoRefreshEnabled ? 'animate-spin' : ''}`} />
      <span>{autoRefreshEnabled ? 'Auto Refresh' : 'Refresh'}</span>
    </button>
  );
}

export default function PaginationControls({
  newEntriesCount,
  hasMore,
  loading,
  onLoadNew,
  onLoadMore,
}: Omit<PaginationControlsProps, 'autoRefreshEnabled' | 'onAutoRefreshChange'>) {
  return (
    <div className="space-y-4">
      <NewEntriesButton
        count={newEntriesCount}
        onClick={onLoadNew}
        loading={loading}
      />
      <LoadMoreButton hasMore={hasMore} onClick={onLoadMore} loading={loading} />
    </div>
  );
}
