import { ReactNode } from 'react';
import { LucideIcon, RefreshCw, X } from 'lucide-react';

interface FilterItem {
  category: string;
  value: string;
  onRemove: () => void;
}

interface PageHeaderProps {
  // Title & Icon
  title: string;
  icon: LucideIcon;
  iconColor?: string;

  // Counts & Stats
  count?: number;
  totalCount?: number;
  subtitle?: string;

  // Loading states
  loading?: boolean;
  refreshing?: boolean;

  // Actions
  onRefresh?: () => void;
  autoRefreshEnabled?: boolean;
  onAutoRefreshToggle?: (enabled: boolean) => void;

  // Filters
  filters?: FilterItem[];
  onClearAllFilters?: () => void;

  // Custom actions slot
  actions?: ReactNode;

  // Additional filter controls slot (e.g., status filter tabs)
  filterControls?: ReactNode;
}

export default function PageHeader({
  title,
  icon: Icon,
  iconColor = 'text-primary-600 dark:text-primary-400',
  count,
  totalCount,
  subtitle,
  loading,
  refreshing,
  onRefresh,
  autoRefreshEnabled,
  onAutoRefreshToggle,
  filters = [],
  onClearAllFilters,
  actions,
  filterControls,
}: PageHeaderProps) {
  const hasActiveFilters = filters.length > 0;
  const displayCount = count ?? totalCount;

  // Group filters by category
  const groupedFilters = filters.reduce((acc, filter) => {
    if (!acc[filter.category]) {
      acc[filter.category] = [];
    }
    acc[filter.category].push(filter);
    return acc;
  }, {} as Record<string, FilterItem[]>);

  return (
    <div className="fixed top-0 left-0 right-0 lg:left-64 z-30 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      {/* Main Header Row */}
      <div className="h-16 px-4 lg:px-6 flex items-center justify-between">
        {/* Left: Icon, Title, Count */}
        <div className="flex items-center space-x-3">
          {/* Icon with background */}
          <div className="hidden sm:flex p-2 rounded-lg bg-gray-100 dark:bg-gray-800">
            <Icon className={`h-5 w-5 ${iconColor}`} />
          </div>

          {/* Title & Subtitle */}
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {title}
            </h1>

            {/* Entry Count Badge */}
            {displayCount !== undefined && (
              <span
                role="status"
                aria-live="polite"
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                {displayCount.toLocaleString()}
                {totalCount !== undefined && count !== undefined && count !== totalCount && (
                  <span className="text-gray-400 dark:text-gray-500 ml-1">
                    / {totalCount.toLocaleString()}
                  </span>
                )}
              </span>
            )}

            {/* Subtitle / Status */}
            {subtitle && (
              <span className="hidden md:inline text-sm text-gray-500 dark:text-gray-400">
                {subtitle}
              </span>
            )}

          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2">
          {/* Custom Actions */}
          {actions}

          {/* Auto-Refresh Toggle */}
          {onAutoRefreshToggle && (
            <button
              onClick={() => onAutoRefreshToggle(!autoRefreshEnabled)}
              className={`hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                autoRefreshEnabled
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title={autoRefreshEnabled ? 'Auto-refresh enabled' : 'Auto-refresh disabled'}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${autoRefreshEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span>Auto Refresh</span>
            </button>
          )}

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading || refreshing}
              aria-busy={refreshing}
              aria-label={refreshing ? 'Refreshing...' : 'Refresh'}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Filter Controls Row (optional) */}
      {filterControls && (
        <div className="px-4 lg:px-6 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          {filterControls}
        </div>
      )}

      {/* Active Filters Row */}
      {hasActiveFilters && (
        <div className="px-4 lg:px-6 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
          <div className="flex items-center flex-wrap gap-2">
            {/* Filters Label */}
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">
              Filters:
            </span>

            {/* Grouped Filters */}
            {Object.entries(groupedFilters).map(([category, categoryFilters]) => (
              <div key={category} className="flex items-center space-x-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {category}:
                </span>
                {categoryFilters.map((filter, idx) => (
                  <button
                    key={`${filter.category}-${filter.value}-${idx}`}
                    onClick={filter.onRemove}
                    aria-label={`Remove ${category} filter: ${filter.value}`}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors group uppercase"
                  >
                    <span>{filter.value}</span>
                    <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            ))}

            {/* Clear All Button */}
            {onClearAllFilters && filters.length > 1 && (
              <button
                onClick={onClearAllFilters}
                className="ml-2 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Utility component for filter controls (status tabs, toggles, etc.)
interface FilterTabsProps {
  tabs: { id: string; label: string; count?: number }[];
  activeTab: string;
  onChange: (id: string) => void;
}

export function FilterTabs({ tabs, activeTab, onChange }: FilterTabsProps) {
  return (
    <div className="flex items-center space-x-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === tab.id
              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-1.5 text-xs ${
              activeTab === tab.id
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-400 dark:text-gray-500'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// Toggle switch component for header
interface ToggleSwitchProps {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  icon?: LucideIcon;
}

export function ToggleSwitch({ label, enabled, onChange, icon: Icon }: ToggleSwitchProps) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
        enabled
          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {Icon && <Icon className="h-4 w-4" />}
      <span>{label}</span>
    </button>
  );
}
