import { useEffect, useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { parseDate } from '../utils/date';
import { Trash2, Clock, HardDrive, RefreshCw, Play } from 'lucide-react';
import { getPruningStatus, runPruning } from '../api';
import { PruningStatus as PruningStatusType } from '../types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function PruningStatusPanel() {
  const [status, setStatus] = useState<PruningStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await getPruningStatus();
      setStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch pruning status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunPruning = async () => {
    setRunning(true);
    try {
      const result = await runPruning();
      if (result.success) {
        await fetchStatus();
      }
    } catch (error) {
      console.error('Failed to run pruning:', error);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Storage & Pruning
        </h2>
        <button
          onClick={handleRunPruning}
          disabled={running || !status.enabled}
          className="btn btn-secondary btn-sm flex items-center space-x-1"
        >
          {running ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : (
            <Play className="h-3 w-3" />
          )}
          <span>Prune Now</span>
        </button>
      </div>

      <div className="space-y-4">
        {/* Storage Info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <HardDrive className="h-5 w-5 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">Database Size</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {status.databaseSize ? formatBytes(status.databaseSize) : 'N/A'}
          </span>
        </div>

        {/* Total Entries */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Trash2 className="h-5 w-5 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">Total Entries</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {status.totalEntries.toLocaleString()}
          </span>
        </div>

        {/* Retention */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Clock className="h-5 w-5 text-gray-400" />
            <span className="text-gray-600 dark:text-gray-300">Retention</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {status.maxAge} hours
          </span>
        </div>

        {/* Last Run */}
        {status.lastRun && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Last pruned</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatDistanceToNow(parseDate(status.lastRun), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Next Run */}
        {status.nextRun && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Next prune</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatDistanceToNow(parseDate(status.nextRun), { addSuffix: true })}
            </span>
          </div>
        )}

        {/* Data Range */}
        {status.oldestEntry && status.newestEntry && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Data range: {format(parseDate(status.oldestEntry), 'MMM d, HH:mm')} -{' '}
              {format(parseDate(status.newestEntry), 'MMM d, HH:mm')}
            </div>
          </div>
        )}

        {/* Status Badge */}
        <div className="pt-2">
          <span
            className={`badge ${
              status.enabled
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}
          >
            {status.enabled ? 'Auto-pruning enabled' : 'Auto-pruning disabled'}
          </span>
        </div>
      </div>
    </div>
  );
}
