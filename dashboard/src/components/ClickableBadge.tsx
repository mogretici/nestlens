import { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListType, FilterType } from '../config/entryTypes';

// Re-export types for backwards compatibility
export type { ListType, FilterType };

// HTTP methods for category detection
const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'GRAPHQL'];

/**
 * Hash-based colors for unknown labels
 * These classes are listed explicitly so Tailwind JIT includes them:
 * bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-400
 * bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400
 * bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-400
 * bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-400
 * bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-400
 * bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-400
 * bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-400
 * bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-400
 */
const hashColors = [
  'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-400',
  'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400',
  'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-400',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-400',
  'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-400',
  'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-400',
  'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900 dark:text-fuchsia-400',
  'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-400',
];

// Generate consistent color index from string hash
function getHashColorIndex(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash) % hashColors.length;
}

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

interface ClickableBadgeProps {
  children: string | number;
  listType?: ListType;
  filterType?: FilterType;
  filterValue?: string;
  onClick?: (e: MouseEvent) => void;
  clickable?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Get badge color based on content
 * Single source of truth for all badge colors in the app
 */
export function getBadgeColor(text: string): string {
  const t = text.toUpperCase();

  // Paths (start with /)
  if (text.startsWith('/')) {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
  }

  // IP addresses (IPv4 like 192.168.1.1 or IPv6 like ::1)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(text) || /^[a-fA-F0-9:]+$/.test(text) && text.includes(':') && !text.includes('.')) {
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
  }

  // Controller actions (contains # or :: or Controller.method pattern)
  if (text.includes('#') || text.includes('::') || /Controller\./i.test(text)) {
    return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
  }

  // Hostnames (like localhost:3000 or api.example.com)
  // Must have TLD-like ending or port number, exclude uppercase event names
  const lowerText = text.toLowerCase();
  const hasPort = /:\d+$/.test(text);
  const hasTld = /\.(com|org|net|io|dev|app|co|local|internal)$/i.test(text);
  const isAllUpperWithDot = /^[A-Z0-9_.]+$/.test(text) && text.includes('.');
  if (lowerText === 'localhost' || (hasPort && !text.startsWith('/')) || (hasTld && !isAllUpperWithDot)) {
    return 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300';
  }

  // HTTP Methods
  if (t === 'GET') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'POST') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (t === 'PUT') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (t === 'PATCH') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
  }
  if (t === 'DELETE') {
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }
  if (['HEAD', 'OPTIONS'].includes(t)) {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'GRAPHQL') {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
  }

  // Status codes (actual numbers like 200, 404, 500)
  const statusCode = parseInt(t, 10);
  if (!isNaN(statusCode) && statusCode >= 100 && statusCode < 600) {
    if (statusCode >= 500) {
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    }
    if (statusCode >= 400) {
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    }
    if (statusCode >= 300) {
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
    }
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }

  // Status code tags
  if (t === 'SUCCESS' || t === '2XX' || t === 'HIT') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'REDIRECT' || t === '3XX') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (t === 'WARNING' || t === 'WARN' || t === '4XX' || t === 'CLIENT-ERROR') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  if (t === 'ERROR' || t === '5XX' || t === 'HTTP-ERROR' || t === 'VALIDATION-ERROR' || t === 'FAILED') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }

  // Slow
  if (t === 'SLOW' || t === 'SLOW QUERY') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }

  // User related
  if (t.startsWith('USER:')) {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }

  // Query types
  if (['SELECT', 'INSERT', 'UPDATE'].includes(t)) {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
  }

  // Log levels
  if (t === 'DEBUG') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (t === 'LOG' || t === 'INFO') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'VERBOSE') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }

  // Entry types
  if (t === 'REQUEST') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
  }
  if (t === 'QUERY') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
  }
  if (t === 'EXCEPTION') {
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
  }
  if (t === 'LOG') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'EVENT') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }
  if (t === 'JOB') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  }
  if (t === 'CACHE') {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
  }
  if (t === 'MAIL') {
    return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200';
  }
  if (t === 'SCHEDULE') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'HTTP-CLIENT') {
    return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200';
  }

  // Status badges
  if (t === 'RESOLVED' || t === 'COMPLETED' || t === 'SENT' || t === 'ACTIVE') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'WAITING' || t === 'DELAYED' || t === 'PENDING') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }

  // Cache operations
  if (t === 'MISS') {
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
  if (t === 'GET' && !httpMethods.includes(t)) {
    // Cache GET operation (already handled by HTTP methods above)
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (t === 'SET') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'DEL' || t === 'DELETE') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  }
  if (t === 'CLEAR') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }

  // Schedule/Job statuses
  if (t === 'STARTED') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }

  // ORM sources
  if (t === 'TYPEORM') {
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
  }
  if (t === 'PRISMA') {
    return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
  }
  if (t === 'MONGOOSE') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  }
  if (t === 'SEQUELIZE') {
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  }
  if (t === 'KNEX') {
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
  }
  if (t === 'MIKRO-ORM') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
  }

  // Normal status
  if (t === 'NORMAL') {
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  }

  // Hash-based color for unknown labels
  return hashColors[getHashColorIndex(t)];
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

  const handleClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (onClick) {
      onClick(e);
      return;
    }

    if (listType && clickable) {
      const value = filterValue || String(children);
      const urlParam = getUrlParam(value, filterType);
      navigate(`/${listType}?${urlParam}=${encodeURIComponent(value)}`);
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
          handleClick(e as any);
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
