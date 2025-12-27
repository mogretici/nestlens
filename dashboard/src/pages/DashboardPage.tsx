import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { parseDate } from '../utils/date';
import {
  Activity,
  Database,
  AlertTriangle,
  FileText,
  Clock,
  Zap,
  Calendar,
  Mail,
  Briefcase,
  Radio,
  HardDrive,
  ChevronRight,
  ChevronLeft,
  Globe,
  Box,
  Bell,
  Layout,
  Terminal,
  Shield,
  Layers,
  Package,
  TrendingUp,
  TrendingDown,
  GitBranch,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { getEntriesWithCursor, getStorageStats, getPruningStatus, runPruning } from '../api';
import { Entry, StorageStats, PruningStatus } from '../types';
import { getBadgeColor } from '../components/ClickableBadge';
import { useStats } from '../contexts/StatsContext';

// Entry type configurations with categories
const entryTypeCategories = [
  {
    name: 'Core',
    types: [
      { key: 'request', name: 'Requests', icon: Activity, color: 'blue', route: '/requests' },
      { key: 'query', name: 'Queries', icon: Database, color: 'purple', route: '/queries' },
      { key: 'graphql', name: 'GraphQL', icon: GitBranch, color: 'fuchsia', route: '/graphql' },
      { key: 'exception', name: 'Exceptions', icon: AlertTriangle, color: 'red', route: '/exceptions' },
      { key: 'log', name: 'Logs', icon: FileText, color: 'green', route: '/logs' },
    ],
  },
  {
    name: 'Background',
    types: [
      { key: 'job', name: 'Jobs', icon: Briefcase, color: 'yellow', route: '/jobs' },
      { key: 'schedule', name: 'Schedule', icon: Calendar, color: 'gray', route: '/schedule' },
      { key: 'batch', name: 'Batches', icon: Package, color: 'lime', route: '/batches' },
      { key: 'command', name: 'Commands', icon: Terminal, color: 'slate', route: '/commands' },
    ],
  },
  {
    name: 'Data',
    types: [
      { key: 'cache', name: 'Cache', icon: HardDrive, color: 'cyan', route: '/cache' },
      { key: 'redis', name: 'Redis', icon: Box, color: 'rose', route: '/redis' },
      { key: 'model', name: 'Models', icon: Layers, color: 'violet', route: '/models' },
    ],
  },
  {
    name: 'Communication',
    types: [
      { key: 'http-client', name: 'HTTP Client', icon: Globe, color: 'indigo', route: '/http-client' },
      { key: 'mail', name: 'Mail', icon: Mail, color: 'pink', route: '/mail' },
      { key: 'notification', name: 'Notifications', icon: Bell, color: 'orange', route: '/notifications' },
      { key: 'event', name: 'Events', icon: Radio, color: 'emerald', route: '/events' },
    ],
  },
  {
    name: 'System',
    types: [
      { key: 'view', name: 'Views', icon: Layout, color: 'teal', route: '/views' },
      { key: 'gate', name: 'Gates', icon: Shield, color: 'amber', route: '/gates' },
      { key: 'dump', name: 'Dumps', icon: HardDrive, color: 'stone', route: '/dumps' },
    ],
  },
];

// Flat list for lookups
const allEntryTypes = entryTypeCategories.flatMap(cat => cat.types);

const typeIconColors: Record<string, string> = {
  request: 'text-blue-500',
  query: 'text-purple-500',
  graphql: 'text-fuchsia-500',
  exception: 'text-red-500',
  log: 'text-green-500',
  event: 'text-emerald-500',
  job: 'text-yellow-500',
  cache: 'text-cyan-500',
  mail: 'text-pink-500',
  schedule: 'text-gray-500',
  'http-client': 'text-indigo-500',
  redis: 'text-rose-500',
  model: 'text-violet-500',
  notification: 'text-orange-500',
  view: 'text-teal-500',
  command: 'text-slate-500',
  gate: 'text-amber-500',
  batch: 'text-lime-500',
  dump: 'text-stone-500',
};

const typeBgColors: Record<string, string> = {
  request: 'bg-blue-50 dark:bg-blue-900/20',
  query: 'bg-purple-50 dark:bg-purple-900/20',
  graphql: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
  exception: 'bg-red-50 dark:bg-red-900/20',
  log: 'bg-green-50 dark:bg-green-900/20',
  event: 'bg-emerald-50 dark:bg-emerald-900/20',
  job: 'bg-yellow-50 dark:bg-yellow-900/20',
  cache: 'bg-cyan-50 dark:bg-cyan-900/20',
  mail: 'bg-pink-50 dark:bg-pink-900/20',
  schedule: 'bg-gray-50 dark:bg-gray-700/30',
  'http-client': 'bg-indigo-50 dark:bg-indigo-900/20',
  redis: 'bg-rose-50 dark:bg-rose-900/20',
  model: 'bg-violet-50 dark:bg-violet-900/20',
  notification: 'bg-orange-50 dark:bg-orange-900/20',
  view: 'bg-teal-50 dark:bg-teal-900/20',
  command: 'bg-slate-50 dark:bg-slate-700/30',
  gate: 'bg-amber-50 dark:bg-amber-900/20',
  batch: 'bg-lime-50 dark:bg-lime-900/20',
  dump: 'bg-stone-50 dark:bg-stone-700/30',
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function getEntryTitle(entry: Entry): string {
  const p = entry.payload;
  switch (entry.type) {
    case 'request':
      return `${(p as { method?: string }).method || 'GET'} ${(p as { path?: string }).path || '/'}`;
    case 'query':
      const query = (p as { query?: string }).query || '';
      return query.length > 50 ? query.substring(0, 50) + '...' : query;
    case 'exception':
      return (p as { name?: string }).name || 'Exception';
    case 'log':
      const msg = (p as { message?: string }).message || '';
      return msg.length > 50 ? msg.substring(0, 50) + '...' : msg;
    case 'event':
      return (p as { name?: string }).name || 'Event';
    case 'job':
      return (p as { name?: string }).name || 'Job';
    case 'cache':
      return `${((p as { operation?: string }).operation || 'get').toUpperCase()} ${(p as { key?: string }).key || ''}`;
    case 'mail':
      return (p as { subject?: string }).subject || 'Mail';
    case 'schedule':
      return (p as { name?: string }).name || 'Task';
    default:
      return 'Entry';
  }
}

function getEntrySubtitle(entry: Entry): string | null {
  const p = entry.payload;
  switch (entry.type) {
    case 'request':
      const status = (p as { statusCode?: number }).statusCode;
      const duration = (p as { duration?: number }).duration;
      return status ? `${status} · ${duration ? formatDuration(duration) : ''}` : null;
    case 'query':
      const qDuration = (p as { duration?: number }).duration;
      const slow = (p as { slow?: boolean }).slow;
      return `${qDuration ? formatDuration(qDuration) : ''} ${slow ? '· SLOW' : ''}`;
    case 'exception':
      const exMsg = (p as { message?: string }).message || '';
      return exMsg.length > 60 ? exMsg.substring(0, 60) + '...' : exMsg;
    case 'log':
      return (p as { context?: string }).context || null;
    case 'job':
      return (p as { queue?: string }).queue || null;
    default:
      return null;
  }
}

const ACTIVITY_PAGE_SIZE = 5;

// Stat Card Component
function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  status = 'neutral',
  onClick,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | null;
  status?: 'good' | 'warning' | 'danger' | 'neutral';
  onClick?: () => void;
}) {
  const statusColors = {
    good: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-red-500',
    neutral: 'text-gray-400 dark:text-gray-500',
  };

  const statusBgColors = {
    good: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
    warning: 'bg-amber-100 dark:bg-amber-900/30 border-amber-300 dark:border-amber-700/50',
    danger: 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700/50',
    neutral: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  };

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`${statusBgColors[status]} rounded-lg border p-4 ${
        onClick ? 'cursor-pointer hover:shadow-sm transition-all text-left w-full' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            {label}
          </p>
          <div className="flex items-baseline gap-2">
            <p className="text-xl font-semibold text-gray-900 dark:text-white">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </p>
            {trend && (
              <span className={`flex items-center ${trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
                {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              </span>
            )}
          </div>
          {subtext && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {subtext}
            </p>
          )}
        </div>
        <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50`}>
          <Icon className={`h-5 w-5 ${statusColors[status]}`} />
        </div>
      </div>
    </Component>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { stats, refreshStats } = useStats();
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [pruningStatus, setPruningStatus] = useState<PruningStatus | null>(null);
  const [pruningRunning, setPruningRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  // Refresh stats when Dashboard mounts
  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Activity pagination state
  const [activityEntries, setActivityEntries] = useState<Entry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [activityOldestSeq, setActivityOldestSeq] = useState<number | null>(null);
  const [pageHistory, setPageHistory] = useState<{ entries: Entry[], oldestSeq: number | null }[]>([]);

  // Fetch storage and pruning stats
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [storageRes, pruningRes] = await Promise.all([
          getStorageStats(),
          getPruningStatus(),
        ]);
        setStorageStats(storageRes.data);
        setPruningStatus(pruningRes.data);
      } catch (error) {
        console.error('Failed to fetch storage/pruning data:', error);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Handle prune now button
  const handlePruneNow = async () => {
    setPruningRunning(true);
    try {
      const result = await runPruning();
      if (result.success) {
        // Refresh data after pruning
        const [storageRes, pruningRes] = await Promise.all([
          getStorageStats(),
          getPruningStatus(),
        ]);
        setStorageStats(storageRes.data);
        setPruningStatus(pruningRes.data);
        refreshStats();
      }
    } catch (error) {
      console.error('Failed to run pruning:', error);
    } finally {
      setPruningRunning(false);
    }
  };

  // Fetch initial activities
  useEffect(() => {
    const fetchInitialActivities = async () => {
      setLoading(true);
      try {
        const response = await getEntriesWithCursor({ limit: ACTIVITY_PAGE_SIZE });
        setActivityEntries(response.data);
        setActivityTotal(response.meta.total);
        setActivityHasMore(response.meta.hasMore);
        setActivityOldestSeq(response.meta.oldestSequence);
        setActivityPage(1);
        setPageHistory([]);
      } catch (error) {
        console.error('Failed to fetch activities:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialActivities();
  }, []);

  // Pagination handlers
  const loadNextPage = async () => {
    if (!activityHasMore || !activityOldestSeq || activityLoading) return;
    setActivityLoading(true);
    try {
      setPageHistory(prev => [...prev, { entries: activityEntries, oldestSeq: activityOldestSeq }]);
      const response = await getEntriesWithCursor({
        limit: ACTIVITY_PAGE_SIZE,
        beforeSequence: activityOldestSeq,
      });
      setActivityEntries(response.data);
      setActivityHasMore(response.meta.hasMore);
      setActivityOldestSeq(response.meta.oldestSequence);
      setActivityPage(prev => prev + 1);
    } catch (error) {
      console.error('Failed to load next page:', error);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadPrevPage = () => {
    if (pageHistory.length === 0) return;
    const prevPage = pageHistory[pageHistory.length - 1];
    setPageHistory(prev => prev.slice(0, -1));
    setActivityEntries(prevPage.entries);
    setActivityOldestSeq(prevPage.oldestSeq);
    setActivityHasMore(true);
    setActivityPage(prev => prev - 1);
  };

  const canGoPrev = pageHistory.length > 0;
  const canGoNext = activityHasMore;
  const totalPages = Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" role="status" aria-label="Loading...">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // Calculate metrics
  const totalRequests = stats?.byType.request || 0;
  const totalExceptions = stats?.byType.exception || 0;
  const unresolvedExceptions = stats?.unresolvedExceptions ?? totalExceptions;
  const avgLatency = stats?.avgResponseTime || 0;
  const slowQueries = stats?.slowQueries || 0;

  // Determine health status
  const isLatencyGood = avgLatency < 200;

  // Get entry type icon component
  const getTypeIcon = (type: string) => {
    const config = allEntryTypes.find(t => t.key === type);
    return config?.icon || Activity;
  };

  // Get entry type route
  const getTypeRoute = (type: string) => {
    const config = allEntryTypes.find(t => t.key === type);
    return config?.route || '/';
  };

  return (
    <div className="space-y-5">
      {/* Key Metrics - Golden Signals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Entries"
          value={stats?.total || 0}
          subtext="total recorded"
          icon={Database}
          status="neutral"
        />
        <StatCard
          label="Errors"
          value={unresolvedExceptions}
          subtext="unresolved exceptions"
          icon={AlertTriangle}
          status={unresolvedExceptions === 0 ? 'good' : 'danger'}
          onClick={() => navigate('/exceptions?resolved=false')}
        />
        <StatCard
          label="Latency"
          value={avgLatency ? `${Math.round(avgLatency)}ms` : 'N/A'}
          subtext="avg response time"
          icon={Clock}
          status={avgLatency === 0 ? 'neutral' : isLatencyGood ? 'good' : 'warning'}
        />
        <StatCard
          label="Slow Queries"
          value={slowQueries}
          subtext="exceeding threshold"
          icon={Zap}
          status={slowQueries === 0 ? 'good' : 'warning'}
          onClick={() => navigate('/queries?slow=true')}
        />
      </div>

      {/* Entry Types Grid - Categorized */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {entryTypeCategories.map((category) => (
          <div
            key={category.name}
            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {category.name}
              </h3>
            </div>
            <div className="p-2.5">
              {category.types.map((type) => {
                // For exceptions, show unresolved count instead of total
                const count = type.key === 'exception'
                  ? (stats?.unresolvedExceptions ?? 0)
                  : (stats?.byType[type.key as keyof typeof stats.byType] || 0);
                const Icon = type.icon;
                const hasData = count > 0;

                return (
                  <Link
                    key={type.key}
                    to={type.route}
                    className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all ${
                      hasData
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        : 'opacity-50 hover:opacity-75'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${typeBgColors[type.key] || 'bg-gray-100 dark:bg-gray-700/50'} group-hover:scale-105 transition-transform`}>
                      <Icon className={`h-3.5 w-3.5 ${typeIconColors[type.key] || 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {type.name}
                      </span>
                    </div>
                    <span className={`text-sm font-semibold tabular-nums ${
                      hasData ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {count.toLocaleString()}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Recent Activity
              </h2>
              {activityLoading && (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-600" role="status" aria-label="Loading"></div>
              )}
            </div>
            {activityTotal > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {activityPage} / {totalPages}
              </span>
            )}
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-700/50 flex-1 relative" style={{ minHeight: '340px' }}>
            {activityLoading && activityEntries.length > 0 && (
              <div className="absolute inset-0 bg-white/50 dark:bg-gray-800/50 z-10 pointer-events-none" />
            )}
            {activityEntries.length === 0 && !activityLoading ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <Activity className="h-7 w-7 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No entries recorded yet</p>
              </div>
            ) : activityEntries.length === 0 && activityLoading ? (
              <div className="p-8 flex items-center justify-center" role="status" aria-label="Loading...">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
              </div>
            ) : (
              activityEntries.map((entry) => {
                const Icon = getTypeIcon(entry.type);
                const title = getEntryTitle(entry);
                const subtitle = getEntrySubtitle(entry);

                return (
                  <div
                    key={entry.id}
                    onClick={() => navigate(`${getTypeRoute(entry.type)}/${entry.id}`)}
                    className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer flex items-center gap-3 transition-colors"
                  >
                    <div className="flex-shrink-0 p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50">
                      <Icon className={`h-4 w-4 ${typeIconColors[entry.type] || 'text-gray-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${getBadgeColor(entry.type)}`}>
                          {entry.type}
                        </span>
                        <span className="text-sm text-gray-900 dark:text-white truncate font-mono">
                          {title}
                        </span>
                      </div>
                      {subtitle && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {subtitle}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {formatDistanceToNow(parseDate(entry.createdAt), { addSuffix: true })}
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={loadPrevPage}
                disabled={!canGoPrev || activityLoading}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  canGoPrev && !activityLoading
                    ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {activityPage} of {totalPages}
              </span>
              <button
                onClick={loadNextPage}
                disabled={!canGoNext || activityLoading}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  canGoNext && !activityLoading
                    ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                }`}
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* System Overview */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              System Overview
            </h2>
          </div>
          <div className="p-4 space-y-4">
            {/* Stats List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <HardDrive className="h-4 w-4" />
                  <span className="text-sm">Database Size</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {storageStats?.databaseSize ? formatBytes(storageStats.databaseSize) : 'N/A'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Error Rate</span>
                </div>
                <span className={`text-sm font-semibold ${
                  totalRequests > 0 && (totalExceptions / totalRequests * 100) < 5
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {totalRequests > 0 ? ((totalExceptions / totalRequests) * 100).toFixed(2) : '0.00'}%
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Retention</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  {pruningStatus?.maxAge || 24}h
                </span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700/50">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Trash2 className="h-4 w-4" />
                  <span className="text-sm">Last Prune</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {pruningStatus?.lastRun
                    ? formatDistanceToNow(parseDate(pruningStatus.lastRun), { addSuffix: true })
                    : 'Never'}
                </span>
              </div>

              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">Next Prune</span>
                </div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {pruningStatus?.nextRun
                    ? formatDistanceToNow(parseDate(pruningStatus.nextRun), { addSuffix: true })
                    : 'N/A'}
                </span>
              </div>
            </div>

            {/* Prune Now Button */}
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={handlePruneNow}
                disabled={pruningRunning || !pruningStatus?.enabled}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pruningRunning ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span>{pruningRunning ? 'Pruning...' : 'Prune Now'}</span>
              </button>
            </div>

            {/* Data Range */}
            {storageStats?.oldestEntry && storageStats?.newestEntry && (
              <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Recording for {formatDistanceToNow(parseDate(storageStats.oldestEntry))}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
