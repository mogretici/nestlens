import { useNavigate, useLocation } from 'react-router-dom';
import { ListType, FilterType } from '../config/entryTypes';
import { getFilterUrlKey, FilterCategory } from '../hooks/useEntryFilters';
import { getBadgeColor, httpMethods } from './badgeColors';

// Re-export types for backwards compatibility
export type { ListType, FilterType };

// Common hostnames that don't contain dots or colons
const commonHostnames = ['localhost'];

/**
 * Get URL parameter key for a filter value
 *
 * SIMPLE RULE: If filterType is provided, use it as the URL key.
 * This eliminates the need for manual mapping - the filterType IS the API key.
 *
 * Auto-detection only runs when filterType is not provided.
 */
const getUrlParam = (value: string, filterType?: FilterType): string => {
  // If filterType is explicitly set, use it directly as the URL key
  // No mapping needed - filterType === urlKey
  if (filterType && filterType !== 'tag') {
    return filterType;
  }

  // Auto-detection when no filterType is specified (fallback for legacy usage)
  // USER:<id> auto-tags contain ':' and would be misdetected as hostnames
  if (/^user:/i.test(value)) {
    return 'tags';
  }

  // Check for IPv4 addresses FIRST (before status code detection)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return 'ips';
  }

  const upper = value.toUpperCase();
  if (httpMethods.includes(upper)) return 'methods';

  const num = parseInt(value, 10);
  if (!isNaN(num) && num >= 100 && num < 600) return 'statuses';

  // IPv6 addresses
  if (/^[a-fA-F0-9:]+$/.test(value) && value.includes(':') && !value.includes('.')) {
    return 'ips';
  }

  // Controller actions (contains # or :: or ends with Controller.method pattern)
  if (value.includes('#') || value.includes('::') || /Controller\./i.test(value)) {
    return 'controllers';
  }

  // Hostnames (like localhost:3000 or api.example.com, but not paths)
  if (commonHostnames.includes(value.toLowerCase()) ||
      ((value.includes('.') || value.includes(':')) && !value.startsWith('/') && !/^\d+$/.test(value))) {
    return 'hostnames';
  }

  return 'tags';
};

/**
 * What activates a badge: a click, or Enter/Space while it holds focus. The
 * handler only needs the two methods both events carry.
 */
type BadgeActivation = Pick<Event, 'preventDefault' | 'stopPropagation'>;

interface ClickableBadgeProps {
  children: string | number;
  listType?: ListType;
  filterType?: FilterType;
  filterValue?: string;
  onClick?: (e: BadgeActivation) => void;
  clickable?: boolean;
  className?: string;
  ariaLabel?: string;
}


/**
 * Unified clickable badge component
 * Use this for all badges/tags throughout the app
 */
export default function ClickableBadge({
  children,
  listType,
  filterType = 'tag',
  filterValue,
  onClick,
  clickable = true,
  className = '',
  ariaLabel,
}: ClickableBadgeProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = (e: BadgeActivation) => {
    e.preventDefault();
    e.stopPropagation();

    if (onClick) {
      onClick(e);
      return;
    }

    if (listType && clickable) {
      const value = filterValue || String(children);
      // Use getFilterUrlKey to properly map category name to URL key
      // This ensures 'statuses' → 'dumpStatuses' for dumps, 'statuses' → 'statuses' for requests, etc.
      const urlParam = filterType && filterType !== 'tag'
        ? getFilterUrlKey(listType, filterType as FilterCategory)
        : getUrlParam(value, filterType);

      // Check if we're on the same list type page (e.g., /logs or /logs/123)
      const currentPath = location.pathname;
      const isOnSameListType = currentPath === `/${listType}` || currentPath.startsWith(`/${listType}/`);

      // If on same list type, merge with existing filters; otherwise start fresh
      const searchParams = isOnSameListType
        ? new URLSearchParams(location.search)
        : new URLSearchParams();

      // Add or update the filter value
      const existingValues = searchParams.get(urlParam);
      if (existingValues) {
        // Check if value already exists in the filter
        const valuesArray = existingValues.split(',');
        if (!valuesArray.includes(value)) {
          // Add to existing values
          searchParams.set(urlParam, [...valuesArray, value].join(','));
        }
        // If value already exists, keep as is (clicking same badge again doesn't duplicate)
      } else {
        searchParams.set(urlParam, value);
      }

      navigate(`/${listType}?${searchParams.toString()}`);
    }
  };

  const isClickable = clickable && (!!onClick || !!listType);
  const colorClass = getBadgeColor(String(children));
  const clickableStyles = isClickable ? 'cursor-pointer hover:scale-105 transition-transform' : '';

  // Always display uppercase
  const displayText = String(children).toUpperCase();

  // Generate default aria-label if not provided and badge is clickable
  const effectiveAriaLabel = ariaLabel || (isClickable ? `Click to filter by ${displayText}` : undefined);

  return (
    <span
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      aria-label={effectiveAriaLabel}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick(e);
        }
      } : undefined}
      title={displayText}
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap shadow ${colorClass} ${clickableStyles} ${isClickable ? 'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1' : ''} ${className}`}
    >
      {displayText}
    </span>
  );
}

interface FilterBadgeProps {
  children: string;
  onRemove: () => void;
  className?: string;
}

/**
 * Badge with remove button for filter displays
 * Always displays uppercase
 */
export function FilterBadge({ children, onRemove, className = '' }: FilterBadgeProps) {
  const colorClass = getBadgeColor(children);
  const displayText = children.toUpperCase();

  return (
    <span
      title={displayText}
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide max-w-[200px] shadow ${colorClass} ${className}`}
    >
      <span className="truncate">{displayText}</span>
      <button
        onClick={onRemove}
        aria-label={`Remove filter: ${displayText}`}
        className="ml-1 flex-shrink-0 hover:opacity-70 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

interface BadgeListProps {
  items: string[];
  listType: ListType;
  filterType?: FilterType;
  maxItems?: number;
  clickable?: boolean;
}

/**
 * List of clickable badges
 */
export function BadgeList({
  items,
  listType,
  filterType = 'tag',
  maxItems = 99,
  clickable = true,
}: BadgeListProps) {
  if (!items || items.length === 0) return null;

  const displayItems = items.slice(0, maxItems);
  const remaining = items.length - maxItems;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {displayItems.map((item) => (
        <ClickableBadge
          key={item}
          listType={listType}
          filterType={filterType}
          clickable={clickable}
        >
          {item}
        </ClickableBadge>
      ))}
      {remaining > 0 && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          +{remaining}
        </span>
      )}
    </div>
  );
}
