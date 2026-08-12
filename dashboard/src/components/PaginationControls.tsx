import { ChevronDown, Bell, RefreshCw } from 'lucide-react';

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
